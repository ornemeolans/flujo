import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { openDatabase } from '../src/db.js'
import { createApp } from '../src/app.js'
import { createAi } from '../src/ai.js'

const geminiReply = (json, finishReason = 'STOP') => ({
  ok: true,
  json: async () => ({ candidates: [{ finishReason, content: { parts: [{ text: JSON.stringify(json) }] } }] }),
})

const MONTH = { month: 'Octubre 2026', income: 1500000, expense: 900000, previousExpense: 800000, categories: [{ label: 'Hogar', amount: 450000 }] }

test('createAi sin clave devuelve null', () => {
  assert.equal(createAi({ apiKey: '' }), null)
})

test('categorize: la clave va en un header y la respuesta se limita a las categorías', async () => {
  const calls = []
  const ai = createAi({ apiKey: 'clave', fetch: async (url, init) => { calls.push({ url, init }); return geminiReply({ category: 'food' }) } })
  assert.equal(await ai.categorize('Coto'), 'food')
  assert.ok(!calls[0].url.includes('clave'))
  assert.equal(calls[0].init.headers['x-goog-api-key'], 'clave')

  const rara = createAi({ apiKey: 'clave', fetch: async () => geminiReply({ category: 'salary' }) })
  assert.equal(await rara.categorize('algo'), 'other')
})

test('summarizeMonth: envía totales formateados, y ninguna descripción', async () => {
  let body
  const ai = createAi({ apiKey: 'clave', fetch: async (_url, init) => { body = JSON.parse(init.body); return geminiReply({ summary: ' Buen mes. ', tips: [' Poné un tope a Hogar. '] }) } })
  assert.deepEqual(await ai.summarizeMonth(MONTH), { summary: 'Buen mes.', tips: ['Poné un tope a Hogar.'] })
  const prompt = body.contents[0].parts[0].text
  assert.match(prompt, /Balance: \$600\.000/)
  assert.match(prompt, /Hogar: \$450\.000 \(50% de los egresos\)/)
  assert.ok(prompt.includes('los egresos totales subieron $100.000 (13%)'))
})

test('summarizeMonth: informa el ahorro del mes y prohíbe recomendar productos financieros', async () => {
  let body
  const ai = createAi({ apiKey: 'clave', fetch: async (_url, init) => { body = JSON.parse(init.body); return geminiReply({ summary: 'ok', tips: [] }) } })
  await ai.summarizeMonth(MONTH)
  assert.match(body.contents[0].parts[0].text, /Ahorro del mes: 40% de los ingresos/)
  assert.match(body.systemInstruction.parts[0].text, /Nunca recomiendes productos financieros/)
  assert.deepEqual(body.generationConfig.responseSchema.required, ['summary', 'tips'])

  await ai.summarizeMonth({ ...MONTH, expense: 2_000_000 })
  assert.match(body.contents[0].parts[0].text, /Ahorro del mes: no hubo/)
})

test('summarizeMonth: deja como mucho 3 consejos válidos', async () => {
  const tips = ['uno', '  ', 42, 'dos', 'tres', 'cuatro', 'x'.repeat(500)]
  const ai = createAi({ apiKey: 'clave', fetch: async () => geminiReply({ summary: 'ok', tips }) })
  assert.deepEqual((await ai.summarizeMonth(MONTH)).tips, ['uno', 'dos', 'tres'])
  const sinLista = createAi({ apiKey: 'clave', fetch: async () => geminiReply({ summary: 'ok', tips: 'no es lista' }) })
  assert.deepEqual((await sinLista.summarizeMonth(MONTH)).tips, [])
})

test('una respuesta incompleta o un error de Gemini no se aceptan', async () => {
  const cortada = createAi({ apiKey: 'clave', fetch: async () => geminiReply({ summary: 'x' }, 'MAX_TOKENS') })
  await assert.rejects(cortada.summarizeMonth(MONTH), /MAX_TOKENS/)
  let calls = 0
  const caida = createAi({ apiKey: 'clave', retryDelay: 0, fetch: async () => { calls++; return { ok: false, status: 503 } } })
  await assert.rejects(caida.categorize('x'), /503/)
  assert.equal(calls, 3)

  calls = 0
  const rechazada = createAi({ apiKey: 'clave', retryDelay: 0, fetch: async () => { calls++; return { ok: false, status: 403 } } })
  await assert.rejects(rechazada.categorize('x'), /403/)
  assert.equal(calls, 1)
})

test('reintenta si Gemini está saturado o tarda demasiado', async () => {
  const replies = [
    () => ({ ok: false, status: 503 }),
    () => { throw Object.assign(new Error('timeout'), { name: 'TimeoutError' }) },
    () => geminiReply({ category: 'food' }),
  ]
  const ai = createAi({ apiKey: 'clave', retryDelay: 0, fetch: async () => replies.shift()() })
  assert.equal(await ai.categorize('Coto'), 'food')
})

// ─── Endpoints ───────────────────────────────────────────────
let server, base, failing = false
const seen = []

async function start(options) {
  const app = createApp({ db: await openDatabase(':memory:'), jwtSecret: 's', appUrl: 'http://app.test', sendMail: async () => {}, rateLimitMax: 1000, ...options })
  const srv = await new Promise(r => { const s = app.listen(0, () => r(s)) })
  return { srv, url: `http://localhost:${srv.address().port}/api` }
}

async function call(url, path, { body, token } = {}) {
  const res = await fetch(url + path, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token && { authorization: `Bearer ${token}` }) },
    body: body && JSON.stringify(body),
  })
  return { status: res.status, body: await res.json() }
}

const signUp = async (url, email) => (await call(url, '/auth/register', { body: { email, password: 'contraseña1' } })).body.token

before(async () => {
  const fake = {
    async categorize(desc) { if (failing) throw new Error('caído'); seen.push(desc); return 'food' },
    async summarizeMonth(data) { if (failing) throw new Error('caído'); seen.push(data); return { summary: 'Resumen', tips: ['Un consejo'] } },
  }
  ;({ srv: server, url: base } = await start({ ai: fake, aiRateLimitMax: 5 }))
})
after(() => server.close())

test('/config avisa si la IA está disponible', async () => {
  assert.equal((await call(base, '/config')).body.aiEnabled, true)
  const { srv, url } = await start({})
  assert.equal((await call(url, '/config')).body.aiEnabled, false)
  const token = await signUp(url, 'sin-ia@test.com')
  assert.equal((await call(url, '/ai/categorize', { body: { desc: 'x' }, token })).status, 404)
  srv.close()
})

test('los endpoints de IA exigen sesión, validan y limitan por usuario', async () => {
  assert.equal((await call(base, '/ai/categorize', { body: { desc: 'Coto' } })).status, 401)

  const token = await signUp(base, 'ia@test.com')
  assert.equal((await call(base, '/ai/categorize', { body: { desc: '   ' }, token })).status, 400)
  assert.equal((await call(base, '/ai/categorize', { body: { desc: 'x'.repeat(500) }, token })).status, 400)
  assert.deepEqual((await call(base, '/ai/categorize', { body: { desc: ' Coto ' }, token })).body, { category: 'food' })
  assert.equal(seen.at(-1), 'Coto')
  assert.equal((await call(base, '/ai/month-summary', { body: { ...MONTH, income: 'mucho' }, token })).status, 400)
  assert.equal((await call(base, '/ai/month-summary', { body: { ...MONTH, categories: [{ label: 'x', amount: -1 }] }, token })).status, 400)

  // El límite cuenta por usuario: otra cuenta desde la misma IP no se ve afectada
  assert.equal((await call(base, '/ai/categorize', { body: { desc: 'a' }, token })).status, 429)
  const other = await signUp(base, 'otra@test.com')
  assert.equal((await call(base, '/ai/month-summary', { body: { ...MONTH, extra: 'x' }, token: other })).status, 200)
  assert.equal(seen.at(-1).extra, undefined) // solo pasan los campos esperados

  failing = true
  const res = await call(base, '/ai/categorize', { body: { desc: 'Coto' }, token: other })
  failing = false
  assert.equal(res.status, 502)
  assert.ok(!res.body.error.includes('caído'))
})
