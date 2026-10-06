import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import compression from 'compression'
import { openDatabase } from './db.js'
import { createApp } from './app.js'
import { createMailer } from './mailer.js'
import { createPush } from './push.js'
import { startReminderScheduler } from './reminders.js'

const isProd = process.env.NODE_ENV === 'production'
let jwtSecret = process.env.JWT_SECRET
if (!jwtSecret) {
  if (isProd) throw new Error('Falta JWT_SECRET')
  jwtSecret = randomBytes(32).toString('hex')
  console.warn('⚠ JWT_SECRET no definido: se usa uno temporal (las sesiones se pierden al reiniciar)')
}

const db = openDatabase(process.env.DB_PATH || './data/flujo.db')
const push = createPush({
  publicKey: process.env.VAPID_PUBLIC_KEY,
  privateKey: process.env.VAPID_PRIVATE_KEY,
  subject: process.env.VAPID_SUBJECT || 'mailto:hola@example.com',
})
if (push) startReminderScheduler({ db, sendPush: push.send })
else console.warn('⚠ VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY no definidos: notificaciones push desactivadas')

const app = createApp({
  push,
  db,
  jwtSecret,
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  sendMail: createMailer({ apiKey: process.env.RESEND_API_KEY, from: process.env.MAIL_FROM || 'Flujo <onboarding@resend.dev>' }),
  googleClientId: process.env.GOOGLE_CLIENT_ID || undefined,
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean),
})

// Si existe el build de la PWA (../dist), servirlo desde el mismo origen
const dist = resolve(dirname(fileURLToPath(import.meta.url)), '../../dist')
if (existsSync(dist)) {
  app.use(compression())
  // Los archivos con hash en el nombre no cambian nunca: cache de un año.
  // index.html y sw.js siempre se revalidan (si no, la app no se enteraría de versiones nuevas).
  app.use('/assets', express.static(resolve(dist, 'assets'), { immutable: true, maxAge: '1y' }))
  app.use(express.static(dist, { setHeaders: res => res.setHeader('Cache-Control', 'no-cache') }))
  app.get('*', (_req, res) => res.sendFile(resolve(dist, 'index.html')))
}

const port = Number(process.env.PORT) || 3001
app.listen(port, () => console.log(`flujo-server escuchando en http://localhost:${port}`))
