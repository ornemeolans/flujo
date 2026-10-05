import { openDB } from 'idb'

const DB_NAME = 'flujo_db'
const DB_VERSION = 2

export const STORES = {
  WALLETS: 'wallets',
  CARDS: 'cards',
  TRANSACTIONS: 'transactions',
}
export const SYNCED_STORES = Object.values(STORES)

// Cada registro lleva metadatos de sincronización:
//   updatedAt: ms epoch de la última modificación (last-write-wins)
//   deletedAt: ms epoch si fue borrado (soft delete / tombstone), o null
// Los borrados se conservan para poder propagarlos a otros dispositivos.

let dbPromise = null

export function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, tx) {
        if (!db.objectStoreNames.contains(STORES.WALLETS)) {
          const ws = db.createObjectStore(STORES.WALLETS, { keyPath: 'id' })
          ws.createIndex('type', 'type')
        }
        if (!db.objectStoreNames.contains(STORES.CARDS)) {
          db.createObjectStore(STORES.CARDS, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(STORES.TRANSACTIONS)) {
          const ts = db.createObjectStore(STORES.TRANSACTIONS, { keyPath: 'id' })
          ts.createIndex('date', 'date')
          ts.createIndex('walletId', 'walletId')
          ts.createIndex('type', 'type')
          ts.createIndex('category', 'category')
        }

        // v1 → v2: agregar metadatos de sincronización a los registros existentes
        if (oldVersion > 0 && oldVersion < 2) {
          const now = Date.now()
          for (const name of SYNCED_STORES) {
            let cursor = await tx.objectStore(name).openCursor()
            while (cursor) {
              cursor.update({ ...cursor.value, updatedAt: cursor.value.updatedAt ?? now, deletedAt: cursor.value.deletedAt ?? null })
              cursor = await cursor.continue()
            }
          }
        }
      },
    })
  }
  return dbPromise
}

// ─── Notificación de cambios locales (para disparar la sync) ─
const listeners = new Set()
export function onLocalChange(cb) {
  listeners.add(cb)
  return () => listeners.delete(cb)
}
function notify() { listeners.forEach(cb => cb()) }

const stamp = item => ({ ...item, updatedAt: Date.now(), deletedAt: item.deletedAt ?? null })

// ─── Generic CRUD ───────────────────────────────────────────
// getAll devuelve solo registros vivos; getAllRaw incluye los borrados
export async function getAll(store) {
  return (await getAllRaw(store)).filter(r => !r.deletedAt)
}

export async function getAllRaw(store) {
  const db = await getDB()
  return db.getAll(store)
}

export async function getById(store, id) {
  const db = await getDB()
  const item = await db.get(store, id)
  return item?.deletedAt ? undefined : item
}

export async function put(store, item) {
  const db = await getDB()
  const res = await db.put(store, stamp(item))
  notify()
  return res
}

export async function putMany(store, items) {
  if (!items.length) return
  const db = await getDB()
  const tx = db.transaction(store, 'readwrite')
  await Promise.all([...items.map(i => tx.store.put(stamp(i))), tx.done])
  notify()
}

export async function remove(store, id) {
  const db = await getDB()
  const item = await db.get(store, id)
  if (!item || item.deletedAt) return
  const now = Date.now()
  await db.put(store, { ...item, updatedAt: now, deletedAt: now })
  notify()
}

export async function getAllByIndex(store, indexName, value) {
  const db = await getDB()
  return (await db.getAllFromIndex(store, indexName, value)).filter(r => !r.deletedAt)
}

// ─── Sync helpers ───────────────────────────────────────────
// Registros modificados localmente después de `since` (ms epoch)
export async function changesSince(since) {
  const out = []
  for (const store of SYNCED_STORES) {
    for (const r of await getAllRaw(store)) {
      if ((r.updatedAt ?? 0) > since) out.push({ store, record: r })
    }
  }
  return out
}

// Aplica registros remotos sin re-estampar updatedAt (gana el más nuevo).
// Devuelve cuántos registros cambiaron localmente.
export async function applyRemote(changes) {
  const db = await getDB()
  const tx = db.transaction(SYNCED_STORES, 'readwrite')
  let applied = 0
  for (const { store, record } of changes) {
    if (!SYNCED_STORES.includes(store)) continue
    const os = tx.objectStore(store)
    const local = await os.get(record.id)
    if (!local || (record.updatedAt ?? 0) > (local.updatedAt ?? 0)) {
      await os.put(record)
      applied++
    }
  }
  await tx.done
  return applied
}

// Borrado físico (al cerrar sesión: los datos quedan en la cuenta)
export async function wipeLocal() {
  const db = await getDB()
  const tx = db.transaction(SYNCED_STORES, 'readwrite')
  await Promise.all([...SYNCED_STORES.map(s => tx.objectStore(s).clear()), tx.done])
}

// ─── Export / Import (backup) ───────────────────────────────
export async function exportAllData() {
  const [wallets, cards, transactions] = await Promise.all([
    getAll(STORES.WALLETS),
    getAll(STORES.CARDS),
    getAll(STORES.TRANSACTIONS),
  ])
  return { wallets, cards, transactions, exportedAt: new Date().toISOString(), version: DB_VERSION }
}

// Reemplaza los datos actuales. Usa soft delete para que el reemplazo
// también se propague a otros dispositivos si hay sesión iniciada.
export async function importAllData(data) {
  const db = await getDB()
  const tx = db.transaction(SYNCED_STORES, 'readwrite')
  const now = Date.now()
  const incoming = {
    [STORES.WALLETS]: data.wallets ?? [],
    [STORES.CARDS]: data.cards ?? [],
    [STORES.TRANSACTIONS]: data.transactions ?? [],
  }
  for (const store of SYNCED_STORES) {
    const os = tx.objectStore(store)
    const keep = new Set(incoming[store].map(r => r.id))
    for (const r of await os.getAll()) {
      if (!keep.has(r.id) && !r.deletedAt) await os.put({ ...r, updatedAt: now, deletedAt: now })
    }
    for (const r of incoming[store]) await os.put({ ...r, updatedAt: now, deletedAt: null })
  }
  await tx.done
  notify()
}

// ─── Almacenamiento persistente ─────────────────────────────
// Pide al navegador que no borre IndexedDB al liberar espacio.
export async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return null
    if (await navigator.storage.persisted()) return true
    return await navigator.storage.persist()
  } catch {
    return null
  }
}
