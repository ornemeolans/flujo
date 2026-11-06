import { useState } from 'react'
import { useStore } from '@/store'
import { Modal, Input, Button, ColorGrid, IconGrid } from '@/components/ui'
import { CARD_ICONS, PALETTE } from '@/utils'
import styles from './CardModal.module.css'

const DEFAULT = { name: '', closeDay: '', icon: '💳', color: '#A3296B' }

export default function CardModal({ onClose, initial = null, preset = null }) {
  const { saveCard, deleteCard } = useStore()
  const isEdit = !!initial
  const [form, setForm] = useState(initial
    ? { ...initial, closeDay: String(initial.closeDay) }
    : { ...DEFAULT, ...preset }
  )
  // Elegida de la lista del BCRA: el nombre sale de ahí y solo se edita el cierre
  const fromCatalog = !!form.product
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const closingHint = (() => {
    const day = parseInt(form.closeDay)
    if (!day || day < 1 || day > 31) return null
    const today = new Date().getDate()
    return today <= day
      ? `Gastos de hoy → resumen actual`
      : `Gastos de hoy → próximo resumen`
  })()

  async function handleSave() {
    if (!form.name.trim()) return alert('Ingresá un nombre')
    const day = parseInt(form.closeDay)
    if (!day || day < 1 || day > 31) return alert('Ingresá un día de cierre válido (1-31)')
    setSaving(true)
    await saveCard({ ...form, id: initial?.id, closeDay: day })
    setSaving(false)
    onClose()
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar "${form.name}"?`)) return
    await deleteCard(initial.id)
    onClose()
  }

  return (
    <Modal title={isEdit ? 'Editar tarjeta' : 'Nueva tarjeta'} onClose={onClose}>
      {fromCatalog ? (
        <div className={styles.catalog}>
          <span className={styles.catalogName}>💳 {form.name}</span>
          <span className={styles.catalogSub}>{form.entityName} · según el BCRA</span>
        </div>
      ) : (
        <Input
          label="Nombre"
          placeholder="Ej: Visa Galicia"
          value={form.name}
          onChange={e => set('name', e.target.value)}
        />
      )}

      <Input
        label="Día de Cierre"
        type="number"
        inputMode="numeric"
        placeholder="Ej: 15"
        min={1} max={31}
        value={form.closeDay}
        onChange={e => set('closeDay', e.target.value)}
        hint={closingHint}
      />

      {fromCatalog
        ? <p className={styles.note}>El BCRA no publica las fechas de cierre. Si un mes cierra otro día, ajustalo desde el detalle de la tarjeta.</p>
        : (
          <>
            <div className={styles.formGroup}>
              <label className={styles.label}>Ícono</label>
              <IconGrid icons={CARD_ICONS} selected={form.icon} onSelect={v => set('icon', v)} />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.label}>Color</label>
              <ColorGrid colors={PALETTE} selected={form.color} onSelect={v => set('color', v)} />
            </div>
          </>
        )}

      <div className={styles.actions}>
        {isEdit && (
          <Button variant="danger" size="sm" onClick={handleDelete}>Eliminar</Button>
        )}
        <Button variant="primary" size="lg" onClick={handleSave} disabled={saving} className={styles.saveBtn}>
          {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear tarjeta'}
        </Button>
      </div>
    </Modal>
  )
}