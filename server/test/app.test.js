import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { openDatabase } from '../src/db.js'
import { createApp } from '../src/app.js'

let server, base
const mails = []
const lastLink = to => {
  const m = mails.filter(m => m.to === to).at(-1)
  return m && new URL(m.text.match(/https?:\/\/\S+/)[0]).searchParams.get('token')
}

before(async () => {
  const app = createApp({
    db: openDatabase(':memory:'),
    jwtSecret: 'test-secret',
    appUrl: 'http://app.test',
    sendMail: async m => { mails.push(m) },
    rateLimitMax: 1000,
    googleClientId: 'test-client',
    verifyGoogle: async credential => {
      if (credential === 'bad') throw new Error('invalid')
      return JSON.parse(credential)
    },
  })
  await new Promise(r => { server = app.listen(0, r) })
  base = `http://localhost:${server.address().port}/api`
})
after(() => server.close())

async function call(path, { body, token } = {}) {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

test('registro, login y /me con email y contraseña', async () => {
  const reg = await call('/auth/register', { body: { email: 'Ana@Mail.com', password: 'secreta123', name: 'Ana' } })
  assert.equal(reg.status, 201)
  assert.equal(reg.body.user.email, 'ana@mail.com')

  assert.equal((await call('/auth/register', { body: { email: 'ana@mail.com', password: 'otra12345' } })).status, 409)
  assert.equal((await call('/auth/register', { body: { email: 'x@y.com', password: 'corta' } })).status, 400)
  assert.equal((await call('/auth/login', { body: { email: 'ana@mail.com', password: 'mal' } })).status, 401)

  const login = await call('/auth/login', { body: { email: 'ANA@mail.com', password: 'secreta123' } })
  assert.equal(login.status, 200)
  const me = await call('/auth/me', { token: login.body.token })
  assert.equal(me.body.user.name, 'Ana')

  assert.equal((await call('/auth/me')).status, 401)
  assert.equal((await call('/auth/me', { token: 'basura' })).status, 401)
})

test('Google: crea usuario, y vincula a cuenta existente si el email está verificado', async () => {
  const g = await call('/auth/google', { body: { credential: JSON.stringify({ sub: 'g1', email: 'bea@mail.com', email_verified: true, name: 'Bea' }) } })
  assert.equal(g.status, 200)
  assert.equal(g.body.user.hasGoogle, true)
  assert.equal(g.body.user.hasPassword, false)

  // Registro con contraseña sobre un email de Google → rechazado
  assert.equal((await call('/auth/register', { body: { email: 'bea@mail.com', password: 'secreta123' } })).status, 409)

  await call('/auth/register', { body: { email: 'caro@mail.com', password: 'secreta123' } })
  const unverified = await call('/auth/google', { body: { credential: JSON.stringify({ sub: 'g2', email: 'caro@mail.com', email_verified: false }) } })
  assert.equal(unverified.status, 409)
  const linked = await call('/auth/google', { body: { credential: JSON.stringify({ sub: 'g2', email: 'caro@mail.com', email_verified: true }) } })
  assert.equal(linked.status, 200)
  // caro no había verificado su email: la contraseña (que pudo poner un tercero) se descarta
  assert.equal(linked.body.user.hasPassword, false)
  assert.equal(linked.body.user.hasGoogle, true)
  assert.equal(linked.body.user.emailVerified, true)
  assert.equal((await call('/auth/login', { body: { email: 'caro@mail.com', password: 'secreta123' } })).status, 401)

  assert.equal((await call('/auth/google', { body: { credential: 'bad' } })).status, 401)
})

test('sync: push/pull incremental, last-write-wins y aislamiento entre usuarios', async () => {
  const a = (await call('/auth/register', { body: { email: 'sync-a@mail.com', password: 'secreta123' } })).body.token
  const b = (await call('/auth/register', { body: { email: 'sync-b@mail.com', password: 'secreta123' } })).body.token

  const w1 = { id: 'w1', name: 'MP', updatedAt: 100, deletedAt: null }
  const r1 = await call('/sync', { token: a, body: { since: 0, changes: [{ store: 'wallets', record: w1 }] } })
  assert.equal(r1.status, 200)
  assert.deepEqual(r1.body.changes, [{ store: 'wallets', record: w1 }])
  const cursor = r1.body.cursor

  // Sin cambios nuevos → nada que bajar
  const r2 = await call('/sync', { token: a, body: { since: cursor, changes: [] } })
  assert.deepEqual(r2.body.changes, [])
  assert.equal(r2.body.cursor, cursor)

  // Escritura más vieja se ignora; más nueva gana (incluido un borrado)
  await call('/sync', { token: a, body: { since: cursor, changes: [{ store: 'wallets', record: { ...w1, name: 'viejo', updatedAt: 50 } }] } })
  const del = { ...w1, updatedAt: 200, deletedAt: 200 }
  const r3 = await call('/sync', { token: a, body: { since: cursor, changes: [{ store: 'wallets', record: del }] } })
  assert.deepEqual(r3.body.changes, [{ store: 'wallets', record: del }])

  // Otro usuario no ve nada de A
  const rb = await call('/sync', { token: b, body: { since: 0, changes: [] } })
  assert.deepEqual(rb.body.changes, [])

  // Validación
  assert.equal((await call('/sync', { token: a, body: { changes: [{ store: 'hack', record: w1 }] } })).status, 400)
  assert.equal((await call('/sync', { body: { changes: [] } })).status, 401)
})

test('verificación de email', async () => {
  const reg = await call('/auth/register', { body: { email: 'vero@mail.com', password: 'secreta123' } })
  assert.equal(reg.body.user.emailVerified, false)
  await new Promise(r => setTimeout(r, 50)) // el email se envía en segundo plano
  const token = lastLink('vero@mail.com')
  assert.ok(token)
  assert.equal((await call('/auth/verify-email', { body: { token: 'falso' } })).status, 400)
  assert.equal((await call('/auth/verify-email', { body: { token } })).status, 200)
  assert.equal((await call('/auth/verify-email', { body: { token } })).status, 400) // un solo uso
  assert.equal((await call('/auth/me', { token: reg.body.token })).body.user.emailVerified, true)
})

test('recuperación de contraseña invalida las sesiones anteriores', async () => {
  const reg = await call('/auth/register', { body: { email: 'rita@mail.com', password: 'secreta123' } })
  const oldToken = reg.body.token

  // Email inexistente: misma respuesta, sin enviar nada
  const before = mails.length
  assert.equal((await call('/auth/forgot-password', { body: { email: 'nadie@mail.com' } })).status, 200)
  await new Promise(r => setTimeout(r, 50))
  assert.equal(mails.length, before)

  await call('/auth/forgot-password', { body: { email: 'RITA@mail.com' } })
  await new Promise(r => setTimeout(r, 50))
  const token = lastLink('rita@mail.com')
  assert.equal((await call('/auth/reset-password', { body: { token, password: 'corta' } })).status, 400)
  const reset = await call('/auth/reset-password', { body: { token, password: 'nueva12345' } })
  assert.equal(reset.status, 200)
  assert.equal(reset.body.user.emailVerified, true)
  assert.equal((await call('/auth/reset-password', { body: { token, password: 'otra12345' } })).status, 400)

  assert.equal((await call('/auth/me', { token: oldToken })).status, 401)
  assert.equal((await call('/auth/me', { token: reset.body.token })).status, 200)
  assert.equal((await call('/auth/login', { body: { email: 'rita@mail.com', password: 'secreta123' } })).status, 401)
  assert.equal((await call('/auth/login', { body: { email: 'rita@mail.com', password: 'nueva12345' } })).status, 200)
})

test('límite de intentos de login', async () => {
  const app = createApp({ db: openDatabase(':memory:'), jwtSecret: 's', appUrl: 'http://x', sendMail: async () => {}, rateLimitMax: 2 })
  const srv = await new Promise(r => { const s = app.listen(0, () => r(s)) })
  const url = `http://localhost:${srv.address().port}/api/auth/login`
  const post = () => fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' }).then(r => r.status)
  assert.deepEqual([await post(), await post(), await post()], [401, 401, 429])
  srv.close()
})
