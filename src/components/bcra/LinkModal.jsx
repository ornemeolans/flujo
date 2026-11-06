import { useEffect, useState } from 'react'
import { useStore } from '@/store'
import { Modal, Button, Spinner } from '@/components/ui'
import { matchEntity, matchCard } from '@/bcra'
import { useCatalog } from './useCatalog'
import styles from './Bcra.module.css'

/** Lo que todavía no se revisó: billeteras (salvo efectivo) y tarjetas sin entidad */
export const pendingLinks = (wallets, cards) => [
  ...wallets.filter(w => w.type !== 'cash' && !w.entityReviewed).map(item => ({ kind: 'wallet', item })),
  ...cards.filter(c => !c.entityReviewed).map(item => ({ kind: 'card', item })),
]

/** Todas las que se pueden vincular, también las ya revisadas: para cambiar o corregir un vínculo */
export const allLinks = (wallets, cards) => [
  ...wallets.filter(w => w.type !== 'cash').map(item => ({ kind: 'wallet', item })),
  ...cards.map(item => ({ kind: 'card', item })),
]

/**
 * Vincula billeteras y tarjetas ya cargadas con su entidad, con una sugerencia por nombre.
 * all=false: solo las pendientes. all=true: todas, mostrando el vínculo actual de cada una.
 */
export default function LinkModal({ onClose, all = false }) {
  const catalog = useCatalog()
  const { wallets, cards, saveWallet, saveCard } = useStore()
  const [rows] = useState(() => (all ? allLinks : pendingLinks)(wallets, cards))
  const [choice, setChoice] = useState({}) // id → { code, product }
  const [saving, setSaving] = useState(false)
  const entities = catalog.entities
  const byCode = new Map(entities.map(e => [e.code, e]))

  // Sugerencias apenas llega la lista del BCRA; no pisan lo que ya se eligió
  useEffect(() => {
    if (catalog.status !== 'ready') return
    setChoice(prev => Object.fromEntries(rows.map(({ kind, item }) => {
      if (prev[item.id]) return [item.id, prev[item.id]]
      // Si ya está vinculada se muestra su vínculo; si no, una sugerencia por nombre
      if (item.entityCode) return [item.id, { code: item.entityCode, product: item.product ?? '' }]
      const entity = matchEntity(item.name, entities)
      const product = kind === 'card' ? matchCard(item.name, entity) : null
      return [item.id, { code: entity?.code ?? '', product: product?.name ?? '' }]
    })))
  }, [catalog.status]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (id, patch) => setChoice(c => ({ ...c, [id]: { ...c[id], ...patch } }))

  async function save() {
    setSaving(true)
    for (const { kind, item } of rows) {
      const { code, product } = choice[item.id] ?? {}
      const entity = byCode.get(Number(code))
      const newProduct = kind === 'card' && entity && product ? product : undefined
      // Sin cambios no se guarda (no genera sincronización de más)
      if (item.entityReviewed && (entity?.code ?? undefined) === item.entityCode && (kind === 'wallet' || newProduct === item.product)) continue
      // "Sin vincular" también cuenta como revisado: no se vuelve a preguntar; y quita un vínculo anterior
      const link = { entityCode: entity?.code, entityName: entity?.name, entityReviewed: true }
      if (kind === 'wallet') await saveWallet({ ...item, ...link })
      else await saveCard({ ...item, ...link, product: newProduct })
    }
    setSaving(false)
    onClose()
  }

  return (
    <Modal title="Vincular con tu banco" onClose={onClose} size="tall">
      <p className={styles.lead}>Te sugerimos la entidad de cada una según su nombre. Revisá y corregí lo que haga falta: los nombres, saldos y movimientos no cambian.</p>
      {catalog.status === 'loading' && <div className={styles.state}><Spinner size={22} /> Cargando la lista del BCRA…</div>}
      {catalog.status === 'error' && (
        <div className={styles.stateError} role="alert">
          {catalog.error}
          <button type="button" className={styles.linkBtn} onClick={catalog.retry}>Reintentar</button>
        </div>
      )}
      {catalog.status === 'ready' && rows.map(({ kind, item }) => {
        const c = choice[item.id] ?? { code: '', product: '' }
        const entity = byCode.get(Number(c.code))
        return (
          <div key={item.id} className={styles.linkRow}>
            <div className={styles.linkName}>{kind === 'card' ? '💳' : item.icon || '🏦'} {item.name}</div>
            <select className={styles.select} aria-label={`Entidad de ${item.name}`} value={c.code} onChange={e => set(item.id, { code: e.target.value, product: '' })}>
              <option value="">Sin vincular</option>
              {entities.map(e => <option key={e.code} value={e.code}>{e.name}</option>)}
            </select>
            {kind === 'card' && entity?.cards.length > 0 && (
              <select className={styles.select} aria-label={`Tarjeta de ${item.name}`} value={c.product} onChange={e => set(item.id, { product: e.target.value })}>
                <option value="">Tarjeta sin especificar</option>
                {entity.cards.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
              </select>
            )}
          </div>
        )
      })}
      <div className={styles.footer}>
        <Button variant="primary" size="lg" onClick={save} disabled={saving || catalog.status !== 'ready'}>
          {saving ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </Modal>
  )
}
