import { createClient } from '@libsql/client'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

// Un mismo código para SQLite local (desarrollo, tests) y Turso (producción).
// prepare() imita la API de node:sqlite, pero sus métodos devuelven promesas.
function wrap(client) {
  return {
    prepare: sql => ({
      run: (...args) => client.execute({ sql, args }),
      get: async (...args) => (await client.execute({ sql, args })).rows[0],
      all: async (...args) => (await client.execute({ sql, args })).rows,
    }),
    // Todo o nada: si una sentencia falla, no se aplica ninguna
    batch: statements => client.batch(statements, 'write'),
    close: () => client.close(),
  }
}

/** @param {string} url ruta local, `:memory:`, `file:...` o `libsql://...` (Turso) */
export async function openDatabase(url, authToken) {
  const local = !/^(libsql|https?|wss?):/.test(url)
  if (local && url !== ':memory:') {
    const path = url.replace(/^file:/, '')
    mkdirSync(dirname(path), { recursive: true })
    url = `file:${path}`
  }
  const client = createClient({ url, authToken })
  const db = wrap(client)
  if (local) {
    await client.execute('PRAGMA journal_mode = WAL')
    await client.execute('PRAGMA foreign_keys = ON')
  }

  await client.executeMultiple(`
    CREATE TABLE IF NOT EXISTS users (
      id            TEXT PRIMARY KEY,
      email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
      name          TEXT,
      password_hash TEXT,
      google_sub    TEXT UNIQUE,
      created_at    INTEGER NOT NULL
    );

    -- Un registro por (usuario, colección, id). data = JSON tal cual lo guarda la PWA.
    -- seq crece con cada escritura y sirve de cursor para la sync incremental.
    CREATE TABLE IF NOT EXISTS records (
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      store      TEXT NOT NULL,
      id         TEXT NOT NULL,
      data       TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      deleted_at INTEGER,
      seq        INTEGER NOT NULL,
      PRIMARY KEY (user_id, store, id)
    );
    CREATE INDEX IF NOT EXISTS records_user_seq ON records(user_id, seq);

    -- Tokens de un solo uso enviados por email (se guarda solo el hash)
    CREATE TABLE IF NOT EXISTS auth_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind       TEXT NOT NULL CHECK (kind IN ('verify', 'reset')),
      expires_at INTEGER NOT NULL
    );

    -- Suscripciones Web Push (una por dispositivo/navegador)
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint   TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      data       TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS push_subscriptions_user ON push_subscriptions(user_id);

    -- Recordatorios ya enviados (para no repetirlos)
    CREATE TABLE IF NOT EXISTS reminders_sent (
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key     TEXT NOT NULL,
      sent_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, key)
    );
  `)

  // Migraciones de columnas agregadas después de la v1.0
  const cols = new Set((await db.prepare('PRAGMA table_info(users)').all()).map(c => c.name))
  if (!cols.has('email_verified')) await client.execute('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0')
  // Se incrementa al cambiar la contraseña: invalida los JWT emitidos antes
  if (!cols.has('session_version')) await client.execute('ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0')

  return db
}
