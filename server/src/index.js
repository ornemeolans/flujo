import { randomBytes } from 'node:crypto'
import { existsSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { openDatabase } from './db.js'
import { createApp } from './app.js'
import { createMailer } from './mailer.js'

const isProd = process.env.NODE_ENV === 'production'
let jwtSecret = process.env.JWT_SECRET
if (!jwtSecret) {
  if (isProd) throw new Error('Falta JWT_SECRET')
  jwtSecret = randomBytes(32).toString('hex')
  console.warn('⚠ JWT_SECRET no definido: se usa uno temporal (las sesiones se pierden al reiniciar)')
}

const db = openDatabase(process.env.DB_PATH || './data/flujo.db')
const app = createApp({
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
  app.use(express.static(dist))
  app.get('*', (_req, res) => res.sendFile(resolve(dist, 'index.html')))
}

const port = Number(process.env.PORT) || 3001
app.listen(port, () => console.log(`flujo-server escuchando en http://localhost:${port}`))
