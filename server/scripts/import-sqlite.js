// Copia una base SQLite (respaldo de producción) a la base de DATABASE_URL.
//   node --env-file=.env scripts/import-sqlite.js <respaldo.db> [--replace]
// Se niega a escribir en una base con datos, salvo con --replace (para la copia final).
import { DatabaseSync } from 'node:sqlite'
import { openDatabase } from '../src/db.js'

const TABLES = ['users', 'records', 'push_subscriptions', 'reminders_sent']
const BATCH = 200

const [source, flag] = process.argv.slice(2)
if (!source || !process.env.DATABASE_URL) {
  console.error('Uso: DATABASE_URL=... node scripts/import-sqlite.js <respaldo.db> [--replace]')
  process.exit(1)
}

const from = new DatabaseSync(source, { readOnly: true })
const to = await openDatabase(process.env.DATABASE_URL, process.env.DATABASE_AUTH_TOKEN)
const count = async table => (await to.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()).n

const existing = (await Promise.all(TABLES.map(count))).reduce((a, b) => a + b, 0)
if (existing && flag !== '--replace') {
  console.error(`La base destino ya tiene ${existing} filas. Usá --replace si querés reemplazarlas.`)
  process.exit(1)
}

if (existing) {
  await to.batch([...TABLES].reverse().map(t => `DELETE FROM ${t}`))
}
for (const table of TABLES) {
  const rows = from.prepare(`SELECT * FROM ${table}`).all()
  for (let i = 0; i < rows.length; i += BATCH) {
    await to.batch(rows.slice(i, i + BATCH).map(row => {
      const columns = Object.keys(row)
      return {
        sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
        args: Object.values(row),
      }
    }))
  }
}

// Si algo no coincide, no se da por buena la copia
let ok = true
for (const table of TABLES) {
  const expected = from.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n
  const copied = await count(table)
  ok &&= expected === copied
  console.log(`${table}: ${copied} de ${expected}`)
}
const maxSeq = from.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM records').get().s
const copiedSeq = (await to.prepare('SELECT COALESCE(MAX(seq), 0) AS s FROM records').get()).s
ok &&= maxSeq === copiedSeq
console.log(`max seq: ${copiedSeq} de ${maxSeq}`)

from.close()
to.close()
if (!ok) {
  console.error('La copia no coincide con el respaldo')
  process.exit(1)
}
console.log('Copia verificada')
