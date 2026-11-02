import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openDatabase } from '../src/db.js'
import { createApp } from '../src/app.js'

const dir = mkdtempSync(join(tmpdir(), 'flujo-db-'))
const servers = []
const dbs = []
after(() => {
  servers.forEach(s => s.close())
  dbs.forEach(db => db.close())
  // En Windows el archivo puede seguir tomado unos instantes: la carpeta es temporal igual
  try { rmSync(dir, { recursive: true, force: true }) } catch {}
})

async function start() {
  const db = await openDatabase(join(dir, `${servers.length}.db`))
  dbs.push(db)
  const app = createApp({ db, jwtSecret: 's', appUrl: 'http://x', sendMail: async () => {}, rateLimitMax: 1000 })
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)) })
  servers.push(server)
  const base = `http://localhost:${server.address().port}/api`
  const call = async (path, body, token) => {
    const res = await fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: JSON.stringify(body),
    })
    return { status: res.status, body: await res.json() }
  }
  return { db, call }
}

const signUp = async (call, email) => (await call('/auth/register', { email, password: 'contraseña1' })).body.token
const wallet = (updatedAt, name) => ({ store: 'wallets', record: { id: 'w1', name, updatedAt } })

test('sync: gana el cambio más reciente y el cursor avanza solo si algo cambió', async () => {
  const { call } = await start()
  const token = await signUp(call, 'a@test.com')

  const first = await call('/sync', { since: 0, changes: [wallet(100, 'nueva')] }, token)
  assert.equal(first.body.changes[0].record.name, 'nueva')

  const older = await call('/sync', { since: first.body.cursor, changes: [wallet(50, 'vieja')] }, token)
  assert.deepEqual(older.body.changes, [])
  assert.equal(older.body.cursor, first.body.cursor)

  const tie = await call('/sync', { since: first.body.cursor, changes: [wallet(100, 'empate')] }, token)
  assert.deepEqual(tie.body.changes, [])

  const newer = await call('/sync', { since: first.body.cursor, changes: [wallet(200, 'última')] }, token)
  assert.equal(newer.body.changes[0].record.name, 'última')
  assert.ok(newer.body.cursor > first.body.cursor)
})

test('sync: el seq es único aunque un envío traiga más de un lote', async () => {
  const { db, call } = await start()
  const token = await signUp(call, 'b@test.com')
  const changes = Array.from({ length: 1201 }, (_, i) => ({ store: 'transactions', record: { id: `t${i}`, updatedAt: i + 1 } }))
  const { body } = await call('/sync', { since: 0, changes }, token)
  assert.equal(body.changes.length, 1201)
  const { n, distintos } = await db.prepare('SELECT COUNT(*) AS n, COUNT(DISTINCT seq) AS distintos FROM records').get()
  assert.equal(n, 1201)
  assert.equal(distintos, 1201)
})

test('borrar la cuenta no deja datos del usuario y no toca los de otros', async () => {
  const { db, call } = await start()
  const token = await signUp(call, 'c@test.com')
  const other = await signUp(call, 'd@test.com')
  await call('/sync', { since: 0, changes: [wallet(1, 'mía')] }, token)
  await call('/sync', { since: 0, changes: [wallet(1, 'ajena')] }, other)

  assert.equal((await call('/auth/delete-account', {}, token)).status, 200)

  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM users').get()).n, 1)
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM records').get()).n, 1)
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM auth_tokens').get()).n, 1) // el del otro usuario
})

test('un error de base responde 500 sin tumbar el servidor', async () => {
  const { db, call } = await start()
  const token = await signUp(call, 'e@test.com')
  const batch = db.batch
  db.batch = () => Promise.reject(new Error('base caída'))
  const res = await call('/sync', { since: 0, changes: [wallet(1, 'x')] }, token)
  db.batch = batch
  assert.equal(res.status, 500)
  assert.equal((await call('/sync', { since: 0, changes: [] }, token)).status, 200)
})
