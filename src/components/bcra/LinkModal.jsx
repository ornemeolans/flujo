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

/** Vincula billeteras y tarjetas ya cargadas con su entidad, con una sugerencia por nombre */
export default function LinkModal({ onClose }) {
  const catalog = useCatalog()
  const { wallets, cards, saveWallet, saveCard } = useStore()
  const [rows] = useState(() => pendingLinks(wallets, cards))
  const [choice, setChoice] = useState({}) // id → { code, product }
  const [saving, setSaving] = useState(false)
  const entities = catalog.entities
  const byCode = new Map(entities.map(e => [e.code, e]))

  // Sugerencias apenas llega la lista del BCRA; no pisan lo que ya se eligió
  useEffect(() => {
    if (catalog.status !== 'ready') return
    setChoice(prev => Object.fromEntries(rows.map(({ kind, item }) => {
      if (prev[item.id]) return [item.id, prev[item.id]]
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
      // Sin elegir también cuenta como revisado: no se vuelve a preguntar
      const link = entity ? { entityCode: entity.code, entityName: entity.name } : {}
      if (kind === 'wallet') await saveWallet({ ...item, ...link, entityReviewed: true })
      else await saveCard({ ...item, ...link, ...(entity && product ? { product } : {}), entityReviewed: true })
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
