import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

export function openDatabase(path) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

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
  const cols = new Set(db.prepare('PRAGMA table_info(users)').all().map(c => c.name))
  if (!cols.has('email_verified')) db.exec('ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0')
  // Se incrementa al cambiar la contraseña: invalida los JWT emitidos antes
  if (!cols.has('session_version')) db.exec('ALTER TABLE users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0')

  return db
}
