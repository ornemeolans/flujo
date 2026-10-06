import { test } from 'node:test'
import assert from 'node:assert/strict'
import { openDatabase } from '../src/db.js'
import { createApp } from '../src/app.js'
import { computeReminders, runReminders } from '../src/reminders.js'

const loan = {
  id: 'l1', name: 'Préstamo Nación', walletId: 'w1', principal: 1000000, cuotas: 12, paidBefore: 0,
  firstDue: '2026-10-07', mode: 'fixed', cuotaAmount: 100000, tna: 0, iva: false, credited: false,
}
const card = { id: 'c1', name: 'Visa', closeDay: 20 }

test('recordatorios: cuota que vence mañana y cierre de tarjeta en 2 días', () => {
  // 7/10/2026 es miércoles: la cuota 1 vence ese día
  const r = computeReminders({ loans: [loan], cards: [card] }, '2026-10-06')
  assert.deepEqual(r.map(x => x.key), ['loan:l1:1'])
  assert.match(r[0].body, /\$100\.000,00/)

  assert.deepEqual(computeReminders({ cards: [card] }, '2026-10-18').map(x => x.key), ['card:c1:2026-10'])
  // Cierre puntual de ese resumen (los bancos lo mueven)
  assert.deepEqual(computeReminders({ cards: [{ ...card, closeOverrides: { '2026-10': 22 } }] }, '2026-10-18'), [])
  // Cierre del mes siguiente: 31/10 + 2 días = 2/11
  assert.deepEqual(computeReminders({ cards: [{ ...card, closeDay: 2 }] }, '2026-10-31').map(x => x.key), ['card:c1:2026-11'])

  // Si la cuota ya se debitó, no se avisa
  const debited = [{ id: 't', loanId: 'l1', loanCuota: 1 }]
  assert.deepEqual(computeReminders({ loans: [loan], transactions: debited }, '2026-10-06'), [])
  // Vencimiento en sábado 10/1/2027 → se debita el lunes 11: se avisa el domingo
  const sat = { ...loan, firstDue: '2027-01-10' }
  assert.deepEqual(computeReminders({ loans: [sat] }, '2027-01-10').map(x => x.key), ['loan:l1:1'])
})

test('push: suscripción, envío diario sin duplicados y limpieza de suscripciones vencidas', async () => {
  const db = openDatabase(':memory:')
  const sent = []
  const push = {
    publicKey: 'pub-key',
    send: async (sub, payload) => {
      if (sub.endpoint.includes('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 })
      sent.push({ endpoint: sub.endpoint, ...payload })
    },
  }
  const app = createApp({ db, jwtSecret: 's', appUrl: 'http://x', sendMail: async () => {}, push, rateLimitMax: 1000 })
  const srv = await new Promise(r => { const s = app.listen(0, () => r(s)) })
  const base = `http://localhost:${srv.address().port}/api`
  const call = async (path, body, token) => {
    const res = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
      body: body && JSON.stringify(body),
    })
    return { status: res.status, body: await res.json() }
  }

  assert.deepEqual((await call('/push/key')).body, { publicKey: 'pub-key' })
  const { token } = (await call('/auth/register', { email: 'push@mail.com', password: 'secreta123' })).body
  const sub = endpoint => ({ subscription: { endpoint, keys: { p256dh: 'p', auth: 'a' } } })
  assert.equal((await call('/push/subscribe', sub('https://push.example/ok'))).status, 401)
  assert.equal((await call('/push/subscribe', { subscription: { endpoint: 'http://inseguro' } }, token)).status, 400)
  assert.equal((await call('/push/subscribe', sub('https://push.example/ok'), token)).status, 200)
  assert.equal((await call('/push/subscribe', sub('https://push.example/gone'), token)).status, 200)
  await call('/sync', { since: 0, changes: [{ store: 'loans', record: { ...loan, updatedAt: 1, deletedAt: null } }] }, token)

  // 6/10/2026 08:00 en Argentina (11:00 UTC): todavía no es hora
  assert.deepEqual(await runReminders({ db, sendPush: push.send, now: new Date('2026-10-06T11:00:00Z') }), { sent: 0 })
  // 09:30: se envía una vez; la suscripción "gone" (410) se elimina
  await runReminders({ db, sendPush: push.send, now: new Date('2026-10-06T12:30:00Z') })
  await runReminders({ db, sendPush: push.send, now: new Date('2026-10-06T13:30:00Z') })
  assert.deepEqual(sent.map(s => [s.endpoint, s.tag]), [['https://push.example/ok', 'loan:l1:1']])
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM push_subscriptions').get().n, 1)

  // Prueba manual y baja
  assert.deepEqual((await call('/push/test', {}, token)).body, { sent: 1 })
  await call('/push/unsubscribe', { endpoint: 'https://push.example/ok' }, token)
  assert.equal((await call('/push/test', {}, token)).status, 400)
  srv.close()
})
