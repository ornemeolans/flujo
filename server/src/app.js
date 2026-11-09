import express from 'express'
import cors from 'cors'
import { OAuth2Client } from 'google-auth-library'
import {
  hashPassword, verifyPassword, signToken, requireAuth, newUserId, rateLimit,
  newEmailToken, hashEmailToken,
} from './auth.js'
import { actionEmail } from './mailer.js'

const STORES = new Set(['wallets', 'cards', 'transactions', 'loans'])
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const MAX_CHANGES = 5000
const SYNC_BATCH = 500
// Gana el updatedAt más reciente. La regla y el seq van en el SQL: así cada lote
// es atómico y hace un solo viaje a la base, aunque traiga cientos de cambios.
const UPSERT_RECORD = `
  INSERT INTO records (user_id, store, id, data, updated_at, deleted_at, seq)
  VALUES (?, ?, ?, ?, ?, ?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM records))
  ON CONFLICT (user_id, store, id) DO UPDATE SET
    data = excluded.data, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, seq = excluded.seq
  WHERE excluded.updated_at > records.updated_at
`
// Se borra todo explícitamente: en Turso no conviene depender de ON DELETE CASCADE
const DELETE_ACCOUNT = ['reminders_sent', 'push_subscriptions', 'auth_tokens', 'records']
  .map(t => `DELETE FROM ${t} WHERE user_id = ?`)
  .concat('DELETE FROM users WHERE id = ?')
const VERIFY_TTL = 3 * 24 * 60 * 60 * 1000 // 3 días
const RESET_TTL = 60 * 60 * 1000           // 1 hora

// Verifica el ID token que entrega Google Identity Services en el navegador
function googleVerifier(clientId) {
  const client = new OAuth2Client(clientId)
  return async credential => {
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId })
    return ticket.getPayload() // { sub, email, email_verified, name, ... }
  }
}

/**
 * @param {object} opts
 * @param {import('node:sqlite').DatabaseSync} opts.db
 * @param {string} opts.jwtSecret
 * @param {string} opts.appUrl URL pública de la PWA (para los enlaces de los emails)
 * @param {(mail: {to, subject, text, html}) => Promise<void>} opts.sendMail
 * @param {string} [opts.googleClientId]
 * @param {string[]} [opts.corsOrigins]
 * @param {(credential: string) => Promise<object>} [opts.verifyGoogle] inyectable para tests
 * @param {{ publicKey: string, send: (subscription: object, payload: object) => Promise<void> }} [opts.push] Web Push (VAPID)
 * @param {{ categorize: (desc: string) => Promise<string>, summarizeMonth: (data: object) => Promise<string> } | null} [opts.ai] funciones con Gemini
 * @param {number} [opts.rateLimitMax] intentos por IP cada 15 min en login/registro
 * @param {number} [opts.aiRateLimitMax] pedidos de IA por usuario por hora
 */
export function createApp({ db, jwtSecret, appUrl, sendMail, googleClientId, corsOrigins = [], verifyGoogle, push, ai, rateLimitMax = 20, aiRateLimitMax = 30 }) {
  verifyGoogle ??= googleClientId ? googleVerifier(googleClientId) : null
  appUrl = appUrl.replace(/\/$/, '')

  const app = express()
  // Express 4 no captura el rechazo de un handler async: sin esto, un error de base tumba el proceso
  for (const method of ['get', 'post']) {
    const register = app[method].bind(app)
    app[method] = (path, ...handlers) => register(path, ...handlers.map(h => (req, res, next) => Promise.resolve(h(req, res, next)).catch(next)))
  }
  app.set('trust proxy', 1)
  app.use(express.json({ limit: '5mb' }))
  if (corsOrigins.length) app.use(cors({ origin: corsOrigins }))

  const q = {
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByEmail: db.prepare('SELECT * FROM users WHERE email = ?'),
    userByGoogle: db.prepare('SELECT * FROM users WHERE google_sub = ?'),
    insertUser: db.prepare('INSERT INTO users (id, email, name, password_hash, google_sub, email_verified, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'),
    linkGoogle: db.prepare('UPDATE users SET google_sub = ?, name = COALESCE(name, ?), email_verified = 1 WHERE id = ?'),
    // Al vincular Google a una cuenta con email sin verificar, la contraseña la pudo
    // haber puesto otra persona (pre-hijacking): se descarta y se cierran sus sesiones
    dropPassword: db.prepare('UPDATE users SET password_hash = NULL, session_version = session_version + 1 WHERE id = ?'),
    setPassword: db.prepare('UPDATE users SET password_hash = ?, email_verified = 1, session_version = session_version + 1 WHERE id = ?'),
    markVerified: db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?'),
    upsertSub: db.prepare('INSERT INTO push_subscriptions (endpoint, user_id, data, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, data = excluded.data'),
    deleteSub: db.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?'),
    subsOf: db.prepare('SELECT endpoint, data FROM push_subscriptions WHERE user_id = ?'),
    insertToken: db.prepare('INSERT INTO auth_tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)'),
    takeToken: db.prepare('DELETE FROM auth_tokens WHERE token_hash = ? AND kind = ? RETURNING user_id, expires_at'),
    clearTokens: db.prepare('DELETE FROM auth_tokens WHERE user_id = ? AND kind = ?'),
    purgeTokens: db.prepare('DELETE FROM auth_tokens WHERE expires_at < ?'),
    changes: db.prepare('SELECT store, data, seq FROM records WHERE user_id = ? AND seq > ? ORDER BY seq'),
  }

  const publicUser = u => ({
    id: u.id, email: u.email, name: u.name,
    emailVerified: !!u.email_verified, hasPassword: !!u.password_hash, hasGoogle: !!u.google_sub,
  })
  const session = u => ({ token: signToken(u, jwtSecret), user: publicUser(u) })

  // ─── Emails con enlace de un solo uso ─────────────────────
  async function issueToken(userId, kind, ttl) {
    await q.purgeTokens.run(Date.now())
    await q.clearTokens.run(userId, kind) // solo vale el último enlace enviado
    const { token, hash } = newEmailToken()
    await q.insertToken.run(hash, userId, kind, Date.now() + ttl)
    return token
  }

  async function consumeToken(token, kind) {
    const row = await q.takeToken.get(hashEmailToken(token), kind)
    return row && row.expires_at > Date.now() ? row.user_id : null
  }

  async function sendVerification(user) {
    const url = `${appUrl}/auth/verify?token=${await issueToken(user.id, 'verify', VERIFY_TTL)}`
    await sendMail({
      to: user.email,
      subject: 'Confirmá tu email en Flujo',
      ...actionEmail({
        title: 'Confirmá tu email',
        intro: 'Gracias por crear tu cuenta en Flujo. Confirmá que este email es tuyo para poder recuperar la cuenta si olvidás la contraseña.',
        cta: 'Confirmar email',
        url,
        outro: 'El enlace vence en 3 días. Si no creaste esta cuenta, ignorá este mensaje.',
      }),
    })
  }

  async function sendReset(user) {
    const url = `${appUrl}/auth/reset?token=${await issueToken(user.id, 'reset', RESET_TTL)}`
    await sendMail({
      to: user.email,
      subject: 'Restablecer tu contraseña de Flujo',
      ...actionEmail({
        title: 'Restablecer contraseña',
        intro: 'Recibimos un pedido para restablecer la contraseña de tu cuenta de Flujo.',
        cta: 'Elegir nueva contraseña',
        url,
        outro: 'El enlace vence en 1 hora y sirve una sola vez. Si no lo pediste, ignorá este mensaje: tu contraseña no cambia.',
      }),
    })
  }

  const authLimiter = rateLimit({ max: rateLimitMax, windowMs: 15 * 60 * 1000 })
  const mailLimiter = rateLimit({ max: Math.ceil(rateLimitMax / 4), windowMs: 15 * 60 * 1000 })
  const auth = requireAuth(jwtSecret, id => q.userById.get(id))

  const aiLimiter = rateLimit({ max: aiRateLimitMax, windowMs: 60 * 60 * 1000, keyOf: req => req.userId })

  const validPassword = p => typeof p === 'string' && p.length >= 8 && p.length <= 200

  // ─── Config pública (la PWA la consulta para mostrar el botón de Google) ──
  app.get('/api/config', async (_req, res) => {
    res.json({ googleClientId: googleClientId || null, aiEnabled: !!ai })
  })

  // ─── Registro con email y contraseña ──────────────────────
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = req.body?.password
    const name = String(req.body?.name || '').trim().slice(0, 80) || null
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email inválido' })
    if (!validPassword(password)) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })

    const existing = await q.userByEmail.get(email)
    if (existing) {
      const hint = existing.google_sub && !existing.password_hash ? ' Ingresá con Google.' : ''
      return res.status(409).json({ error: `Ya existe una cuenta con ese email.${hint}` })
    }
    const id = newUserId()
    await q.insertUser.run(id, email, name, await hashPassword(password), null, 0, Date.now())
    const user = await q.userById.get(id)
    // Si el email falla, la cuenta igual queda creada; se puede reenviar desde la app
    sendVerification(user).catch(e => console.error('No se pudo enviar el email de verificación:', e.message))
    res.status(201).json(session(user))
  })

  // ─── Login con email y contraseña ─────────────────────────
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const user = await q.userByEmail.get(email)
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      const hint = user?.google_sub && !user.password_hash ? ' Esta cuenta usa Google.' : ''
      return res.status(401).json({ error: `Email o contraseña incorrectos.${hint}` })
    }
    res.json(session(user))
  })

  // ─── Login con Google ─────────────────────────────────────
  app.post('/api/auth/google', authLimiter, async (req, res) => {
    if (!verifyGoogle) return res.status(501).json({ error: 'Login con Google no configurado en el servidor' })
    let payload
    try {
      payload = await verifyGoogle(String(req.body?.credential || ''))
    } catch {
      return res.status(401).json({ error: 'Token de Google inválido' })
    }
    if (!payload?.sub || !payload.email) return res.status(401).json({ error: 'Token de Google inválido' })

    let user = await q.userByGoogle.get(payload.sub)
    if (!user) {
      const byEmail = await q.userByEmail.get(payload.email)
      if (byEmail) {
        // Vincular a una cuenta existente solo si Google verificó el email
        if (!payload.email_verified) return res.status(409).json({ error: 'Ya existe una cuenta con ese email' })
        if (!byEmail.email_verified) await q.dropPassword.run(byEmail.id)
        await q.linkGoogle.run(payload.sub, payload.name ?? null, byEmail.id)
        user = await q.userById.get(byEmail.id)
      } else {
        const id = newUserId()
        await q.insertUser.run(id, payload.email.toLowerCase(), payload.name ?? null, null, payload.sub, payload.email_verified ? 1 : 0, Date.now())
        user = await q.userById.get(id)
      }
    }
    res.json(session(user))
  })

  app.get('/api/auth/me', auth, async (req, res) => {
    res.json({ user: publicUser(req.user) })
  })

  // Elimina la cuenta: sus registros y tokens se borran en cascada
  app.post('/api/auth/delete-account', auth, async (req, res) => {
    await db.batch(DELETE_ACCOUNT.map(sql => ({ sql, args: [req.userId] })))
    res.json({ ok: true })
  })

  // ─── Verificación de email ────────────────────────────────
  app.post('/api/auth/verify-email', authLimiter, async (req, res) => {
    const userId = await consumeToken(req.body?.token, 'verify')
    if (!userId) return res.status(400).json({ error: 'El enlace es inválido o ya venció' })
    await q.markVerified.run(userId)
    res.json({ ok: true })
  })

  app.post('/api/auth/resend-verification', auth, mailLimiter, async (req, res) => {
    if (req.user.email_verified) return res.json({ ok: true })
    try {
      await sendVerification(req.user)
    } catch (e) {
      console.error(e)
      return res.status(502).json({ error: 'No se pudo enviar el email, probá más tarde' })
    }
    res.json({ ok: true })
  })

  // ─── Recuperación de contraseña ───────────────────────────
  // Responde siempre lo mismo para no revelar qué emails tienen cuenta
  app.post('/api/auth/forgot-password', mailLimiter, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const user = EMAIL_RE.test(email) && await q.userByEmail.get(email)
    if (user) sendReset(user).catch(e => console.error('No se pudo enviar el email de recuperación:', e.message))
    res.json({ ok: true })
  })

  app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
    if (!validPassword(req.body?.password)) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
    const userId = await consumeToken(req.body?.token, 'reset')
    if (!userId) return res.status(400).json({ error: 'El enlace es inválido o ya venció. Pedí uno nuevo.' })
    // El enlace llegó al email: eso prueba que es suyo
    await q.setPassword.run(await hashPassword(req.body.password), userId)
    res.json(session(await q.userById.get(userId)))
  })

  // ─── Notificaciones push ──────────────────────────────────
  app.get('/api/push/key', async (_req, res) => {
    if (!push) return res.status(404).json({ error: 'Notificaciones no configuradas en el servidor' })
    res.json({ publicKey: push.publicKey })
  })

  app.post('/api/push/subscribe', auth, async (req, res) => {
    const sub = req.body?.subscription
    if (!push) return res.status(404).json({ error: 'Notificaciones no configuradas en el servidor' })
    if (typeof sub?.endpoint !== 'string' || !sub.endpoint.startsWith('https://') || !sub.keys?.p256dh || !sub.keys?.auth) {
      return res.status(400).json({ error: 'Suscripción inválida' })
    }
    await q.upsertSub.run(sub.endpoint, req.userId, JSON.stringify({ endpoint: sub.endpoint, keys: sub.keys }), Date.now())
    res.json({ ok: true })
  })

  app.post('/api/push/unsubscribe', auth, async (req, res) => {
    await q.deleteSub.run(String(req.body?.endpoint || ''), req.userId)
    res.json({ ok: true })
  })

  // Notificación de prueba a todos los dispositivos del usuario
  app.post('/api/push/test', auth, mailLimiter, async (req, res) => {
    if (!push) return res.status(404).json({ error: 'Notificaciones no configuradas en el servidor' })
    const subs = await q.subsOf.all(req.userId)
    if (!subs.length) return res.status(400).json({ error: 'Este usuario no tiene notificaciones activadas' })
    let sent = 0
    for (const s of subs) {
      try {
        await push.send(JSON.parse(s.data), { title: 'Flujo', body: '¡Listo! Así te vamos a avisar de tus vencimientos.', url: '/settings', tag: 'test' })
        sent++
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await q.deleteSub.run(s.endpoint, req.userId)
      }
    }
    res.json({ sent })
  })

  // ─── IA (Gemini) ──────────────────────────────────────────
  const requireAi = (_req, res, next) => (ai ? next() : res.status(404).json({ error: 'IA no configurada en el servidor' }))
  const amount = n => typeof n === 'number' && Number.isFinite(n) && n >= 0

  // Sin el detalle del error: puede traer datos del proveedor
  async function aiResponse(res, run) {
    try {
      res.json(await run())
    } catch (e) {
      console.error('Error de IA:', e.message)
      res.status(502).json({ error: 'No se pudo completar, probá más tarde' })
    }
  }

  app.post('/api/ai/categorize', auth, requireAi, aiLimiter, async (req, res) => {
    const desc = typeof req.body?.desc === 'string' ? req.body.desc.trim() : ''
    if (!desc || desc.length > 200) return res.status(400).json({ error: 'Descripción inválida' })
    aiResponse(res, async () => ({ category: await ai.categorize(desc) }))
  })

  app.post('/api/ai/month-summary', auth, requireAi, aiLimiter, async (req, res) => {
    const { month, income, expense, previousExpense = 0, categories } = req.body ?? {}
    const validCategories = Array.isArray(categories) && categories.length <= 20 &&
      categories.every(c => typeof c?.label === 'string' && c.label.length <= 40 && amount(c.amount))
    if (typeof month !== 'string' || month.length > 30 || !amount(income) || !amount(expense) || !amount(previousExpense) || !validCategories) {
      return res.status(400).json({ error: 'Datos del mes inválidos' })
    }
    // Devuelve { summary, tips }
    aiResponse(res, () => ai.summarizeMonth({
      month, income, expense, previousExpense,
      categories: categories.map(({ label, amount }) => ({ label, amount })),
    }))
  })

  // ─── Sync ─────────────────────────────────────────────────
  // Body: { since: <cursor>, changes: [{ store, record }] }
  //   1. Aplica los cambios del cliente (gana el updatedAt más reciente).
  //   2. Devuelve todo lo modificado en el servidor desde `since`.
  app.post('/api/sync', auth, async (req, res) => {
    const since = Number(req.body?.since) || 0
    const changes = Array.isArray(req.body?.changes) ? req.body.changes : []
    if (changes.length > MAX_CHANGES) return res.status(413).json({ error: 'Demasiados cambios en un solo envío' })

    for (const c of changes) {
      const r = c?.record
      if (!STORES.has(c?.store) || typeof r?.id !== 'string' || !r.id || r.id.length > 100 || !Number.isFinite(r.updatedAt)) {
        return res.status(400).json({ error: 'Cambio inválido', change: c })
      }
    }

    // Si un lote falla, el cliente reintenta: reaplicar un cambio ya guardado no tiene efecto
    for (let i = 0; i < changes.length; i += SYNC_BATCH) {
      await db.batch(changes.slice(i, i + SYNC_BATCH).map(({ store, record }) => ({
        sql: UPSERT_RECORD,
        args: [req.userId, store, record.id, JSON.stringify(record), record.updatedAt, record.deletedAt ?? null],
      })))
    }

    const rows = await q.changes.all(req.userId, since)
    res.json({
      cursor: rows.length ? rows[rows.length - 1].seq : since,
      changes: rows.map(r => ({ store: r.store, record: JSON.parse(r.data) })),
    })
  })

  app.use('/api', (_req, res) => res.status(404).json({ error: 'No encontrado' }))

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    console.error(err)
    res.status(err.status || 500).json({ error: err.status ? err.message : 'Error interno' })
  })

  return app
}
