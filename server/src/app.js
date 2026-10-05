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
 * @param {number} [opts.rateLimitMax] intentos por IP cada 15 min en login/registro
 */
export function createApp({ db, jwtSecret, appUrl, sendMail, googleClientId, corsOrigins = [], verifyGoogle, rateLimitMax = 20 }) {
  verifyGoogle ??= googleClientId ? googleVerifier(googleClientId) : null
  appUrl = appUrl.replace(/\/$/, '')

  const app = express()
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
    deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
    insertToken: db.prepare('INSERT INTO auth_tokens (token_hash, user_id, kind, expires_at) VALUES (?, ?, ?, ?)'),
    takeToken: db.prepare('DELETE FROM auth_tokens WHERE token_hash = ? AND kind = ? RETURNING user_id, expires_at'),
    clearTokens: db.prepare('DELETE FROM auth_tokens WHERE user_id = ? AND kind = ?'),
    purgeTokens: db.prepare('DELETE FROM auth_tokens WHERE expires_at < ?'),
    recordMeta: db.prepare('SELECT updated_at FROM records WHERE user_id = ? AND store = ? AND id = ?'),
    maxSeq: db.prepare('SELECT COALESCE(MAX(seq), 0) AS seq FROM records'),
    upsert: db.prepare(`
      INSERT INTO records (user_id, store, id, data, updated_at, deleted_at, seq) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT (user_id, store, id) DO UPDATE SET
        data = excluded.data, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at, seq = excluded.seq
    `),
    changes: db.prepare('SELECT store, data, seq FROM records WHERE user_id = ? AND seq > ? ORDER BY seq'),
  }

  const publicUser = u => ({
    id: u.id, email: u.email, name: u.name,
    emailVerified: !!u.email_verified, hasPassword: !!u.password_hash, hasGoogle: !!u.google_sub,
  })
  const session = u => ({ token: signToken(u, jwtSecret), user: publicUser(u) })

  // ─── Emails con enlace de un solo uso ─────────────────────
  function issueToken(userId, kind, ttl) {
    q.purgeTokens.run(Date.now())
    q.clearTokens.run(userId, kind) // solo vale el último enlace enviado
    const { token, hash } = newEmailToken()
    q.insertToken.run(hash, userId, kind, Date.now() + ttl)
    return token
  }

  function consumeToken(token, kind) {
    const row = q.takeToken.get(hashEmailToken(token), kind)
    return row && row.expires_at > Date.now() ? row.user_id : null
  }

  async function sendVerification(user) {
    const url = `${appUrl}/auth/verify?token=${issueToken(user.id, 'verify', VERIFY_TTL)}`
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
    const url = `${appUrl}/auth/reset?token=${issueToken(user.id, 'reset', RESET_TTL)}`
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

  const validPassword = p => typeof p === 'string' && p.length >= 8 && p.length <= 200

  // ─── Config pública (la PWA la consulta para mostrar el botón de Google) ──
  app.get('/api/config', (_req, res) => {
    res.json({ googleClientId: googleClientId || null })
  })

  // ─── Registro con email y contraseña ──────────────────────
  app.post('/api/auth/register', authLimiter, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = req.body?.password
    const name = String(req.body?.name || '').trim().slice(0, 80) || null
    if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email inválido' })
    if (!validPassword(password)) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })

    const existing = q.userByEmail.get(email)
    if (existing) {
      const hint = existing.google_sub && !existing.password_hash ? ' Ingresá con Google.' : ''
      return res.status(409).json({ error: `Ya existe una cuenta con ese email.${hint}` })
    }
    const id = newUserId()
    q.insertUser.run(id, email, name, await hashPassword(password), null, 0, Date.now())
    const user = q.userById.get(id)
    // Si el email falla, la cuenta igual queda creada; se puede reenviar desde la app
    sendVerification(user).catch(e => console.error('No se pudo enviar el email de verificación:', e.message))
    res.status(201).json(session(user))
  })

  // ─── Login con email y contraseña ─────────────────────────
  app.post('/api/auth/login', authLimiter, async (req, res) => {
    const email = String(req.body?.email || '').trim().toLowerCase()
    const password = String(req.body?.password || '')
    const user = q.userByEmail.get(email)
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

    let user = q.userByGoogle.get(payload.sub)
    if (!user) {
      const byEmail = q.userByEmail.get(payload.email)
      if (byEmail) {
        // Vincular a una cuenta existente solo si Google verificó el email
        if (!payload.email_verified) return res.status(409).json({ error: 'Ya existe una cuenta con ese email' })
        if (!byEmail.email_verified) q.dropPassword.run(byEmail.id)
        q.linkGoogle.run(payload.sub, payload.name ?? null, byEmail.id)
        user = q.userById.get(byEmail.id)
      } else {
        const id = newUserId()
        q.insertUser.run(id, payload.email.toLowerCase(), payload.name ?? null, null, payload.sub, payload.email_verified ? 1 : 0, Date.now())
        user = q.userById.get(id)
      }
    }
    res.json(session(user))
  })

  app.get('/api/auth/me', auth, (req, res) => {
    res.json({ user: publicUser(req.user) })
  })

  // Elimina la cuenta: sus registros y tokens se borran en cascada
  app.post('/api/auth/delete-account', auth, (req, res) => {
    q.deleteUser.run(req.userId)
    res.json({ ok: true })
  })

  // ─── Verificación de email ────────────────────────────────
  app.post('/api/auth/verify-email', authLimiter, (req, res) => {
    const userId = consumeToken(req.body?.token, 'verify')
    if (!userId) return res.status(400).json({ error: 'El enlace es inválido o ya venció' })
    q.markVerified.run(userId)
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
    const user = EMAIL_RE.test(email) && q.userByEmail.get(email)
    if (user) sendReset(user).catch(e => console.error('No se pudo enviar el email de recuperación:', e.message))
    res.json({ ok: true })
  })

  app.post('/api/auth/reset-password', authLimiter, async (req, res) => {
    if (!validPassword(req.body?.password)) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' })
    const userId = consumeToken(req.body?.token, 'reset')
    if (!userId) return res.status(400).json({ error: 'El enlace es inválido o ya venció. Pedí uno nuevo.' })
    // El enlace llegó al email: eso prueba que es suyo
    q.setPassword.run(await hashPassword(req.body.password), userId)
    res.json(session(q.userById.get(userId)))
  })

  // ─── Sync ─────────────────────────────────────────────────
  // Body: { since: <cursor>, changes: [{ store, record }] }
  //   1. Aplica los cambios del cliente (gana el updatedAt más reciente).
  //   2. Devuelve todo lo modificado en el servidor desde `since`.
  app.post('/api/sync', auth, (req, res) => {
    const since = Number(req.body?.since) || 0
    const changes = Array.isArray(req.body?.changes) ? req.body.changes : []
    if (changes.length > MAX_CHANGES) return res.status(413).json({ error: 'Demasiados cambios en un solo envío' })

    for (const c of changes) {
      const r = c?.record
      if (!STORES.has(c?.store) || typeof r?.id !== 'string' || !r.id || r.id.length > 100 || !Number.isFinite(r.updatedAt)) {
        return res.status(400).json({ error: 'Cambio inválido', change: c })
      }
    }

    db.exec('BEGIN IMMEDIATE')
    try {
      let seq = q.maxSeq.get().seq
      for (const { store, record } of changes) {
        const current = q.recordMeta.get(req.userId, store, record.id)
        if (current && current.updated_at >= record.updatedAt) continue
        q.upsert.run(req.userId, store, record.id, JSON.stringify(record), record.updatedAt, record.deletedAt ?? null, ++seq)
      }
      db.exec('COMMIT')
    } catch (e) {
      db.exec('ROLLBACK')
      throw e
    }

    const rows = q.changes.all(req.userId, since)
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
