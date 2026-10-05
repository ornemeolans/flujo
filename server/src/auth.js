import { scrypt, randomBytes, timingSafeEqual, randomUUID, createHash } from 'node:crypto'
import { promisify } from 'node:util'
import jwt from 'jsonwebtoken'

const scryptAsync = promisify(scrypt)
const KEYLEN = 64

// Formato: scrypt$<salt hex>$<hash hex>
export async function hashPassword(password) {
  const salt = randomBytes(16)
  const hash = await scryptAsync(password, salt, KEYLEN)
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`
}

export async function verifyPassword(password, stored) {
  if (!stored) return false
  const [algo, saltHex, hashHex] = stored.split('$')
  if (algo !== 'scrypt' || !saltHex || !hashHex) return false
  const expected = Buffer.from(hashHex, 'hex')
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length)
  return timingSafeEqual(expected, actual)
}

// v = session_version del usuario: al cambiar la contraseña se incrementa y
// todos los tokens anteriores dejan de valer
export function signToken(user, secret) {
  return jwt.sign({ sub: user.id, v: user.session_version ?? 0 }, secret, { expiresIn: '30d' })
}

// Middleware: exige `Authorization: Bearer <jwt>` vigente y deja el usuario en req.user
export function requireAuth(secret, getUser) {
  return (req, res, next) => {
    const [scheme, token] = (req.headers.authorization || '').split(' ')
    if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'No autenticado' })
    let payload
    try {
      payload = jwt.verify(token, secret)
    } catch {
      return res.status(401).json({ error: 'Sesión vencida, volvé a iniciar sesión' })
    }
    const user = getUser(payload.sub)
    if (!user || (payload.v ?? 0) !== user.session_version) {
      return res.status(401).json({ error: 'Sesión vencida, volvé a iniciar sesión' })
    }
    req.user = user
    req.userId = user.id
    next()
  }
}

// Token aleatorio para enlaces por email; en la base solo se guarda su hash
export function newEmailToken() {
  const token = randomBytes(32).toString('base64url')
  return { token, hash: hashEmailToken(token) }
}
export const hashEmailToken = token => createHash('sha256').update(String(token)).digest('hex')

export const newUserId = () => randomUUID()

// Límite simple en memoria contra fuerza bruta: N intentos por IP por ventana
export function rateLimit({ max, windowMs }) {
  const hits = new Map()
  return (req, res, next) => {
    const now = Date.now()
    const key = req.ip
    const entry = hits.get(key)
    if (!entry || now > entry.reset) {
      hits.set(key, { count: 1, reset: now + windowMs })
      return next()
    }
    if (++entry.count > max) {
      return res.status(429).json({ error: 'Demasiados intentos, probá en unos minutos' })
    }
    next()
  }
}
