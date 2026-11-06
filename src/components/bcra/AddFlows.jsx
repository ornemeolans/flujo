import { useState } from 'react'
import { Modal } from '@/components/ui'
import { cardDisplayName } from '@/bcra'
import WalletModal from '@/components/modals/WalletModal'
import CardModal from '@/components/modals/CardModal'
import { EntityPicker, KIND_ICON } from './EntityPicker'
import { useCatalog } from './useCatalog'
import styles from './Bcra.module.css'

const WALLET_TYPE = { bank: 'bank', virtual: 'virtual', other: 'other' }

export const walletFromEntity = entity => ({
  name: entity.name,
  type: WALLET_TYPE[entity.kind],
  icon: KIND_ICON[entity.kind],
  entityCode: entity.code,
  entityName: entity.name,
  entityReviewed: true,
})

export const cardFromProduct = (entity, product) => ({
  name: cardDisplayName(product.name, entity),
  icon: '💳',
  entityCode: entity.code,
  entityName: entity.name,
  product: product.name,
  entityReviewed: true,
})

/** Nueva billetera: primero la entidad del BCRA; si no está, el formulario de siempre */
export function AddWalletFlow({ onClose }) {
  const catalog = useCatalog()
  const [preset, setPreset] = useState(null) // null = eligiendo

  if (preset) return <WalletModal preset={preset} onClose={onClose} />

  return (
    <Modal title="Nueva billetera" onClose={onClose} size="tall">
      <p className={styles.lead}>Elegí el banco o la billetera virtual. Después cargás el saldo y, si rinde, la TNA.</p>
      <button type="button" className={styles.manual} onClick={() => setPreset({ name: 'Efectivo', type: 'cash', icon: '💵' })}>
        💵 Efectivo
      </button>
      <EntityPicker
        catalog={catalog}
        onSelect={entity => setPreset(walletFromEntity(entity))}
        onManual={() => setPreset({})}
      />
    </Modal>
  )
}

/** Nueva tarjeta: entidad → tarjeta → día de cierre. Lo único que se carga a mano es el cierre */
export function AddCardFlow({ onClose }) {
  const catalog = useCatalog()
  const [entity, setEntity] = useState(null)
  const [preset, setPreset] = useState(null)

  if (preset) return <CardModal preset={preset} onClose={onClose} />

  if (entity) {
    return (
      <Modal title={entity.name} onClose={onClose} size="tall">
        <p className={styles.lead}>¿Qué tarjeta tenés?</p>
        <ul className={styles.list}>
          {entity.cards.map(product => (
            <li key={product.name}>
              <button type="button" className={styles.row} onClick={() => setPreset(cardFromProduct(entity, product))}>
                <span className={styles.rowIcon} aria-hidden="true">💳</span>
                <span className={styles.rowText}>
                  <span className={styles.rowName}>{product.name}</span>
                  {product.segment && <span className={styles.rowSub}>{product.segment}</span>}
                </span>
                <span className={styles.chevron} aria-hidden="true">›</span>
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className={styles.manual} onClick={() => setPreset({ entityCode: entity.code, entityName: entity.name, entityReviewed: true })}>
          No está en la lista: cargarla a mano
        </button>
        <div className={styles.footer}>
          <button type="button" className={styles.back} onClick={() => setEntity(null)}>‹ Otra entidad</button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Nueva tarjeta" onClose={onClose} size="tall">
      <p className={styles.lead}>Elegí quién emite tu tarjeta.</p>
      <EntityPicker
        catalog={catalog}
        filter={e => e.cards.length > 0}
        onSelect={setEntity}
        onManual={() => setPreset({})}
      />
    </Modal>
  )
}
