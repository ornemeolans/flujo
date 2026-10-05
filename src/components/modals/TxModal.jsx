import { useState, useEffect } from 'react'
import { useStore, selectors } from '@/store'
import {
  Modal, Input, Select, Switch, Button, TypeToggle,
  Badge
} from '@/components/ui'
import { CATEGORIES, PALETTE, WALLET_ICONS, MONTHS_SHORT, today, getCat, fmt2 } from '@/utils'
import styles from './TxModal.module.css'

const DEFAULT_TX = {
  type: 'expense',
  amount: '',
  desc: '',
  date: today(),
  category: 'food',
  walletId: '',
  cuotas: 1,
  cuotaActual: 1,
}

export default function TxModal({ onClose, initial = null }) {
  const { wallets, cards, saveTransaction, deleteTransaction } = useStore()
  const isEdit = !!initial

  const [form, setForm] = useState(initial ? {
    ...initial,
    amount: String(initial.amount),
  } : DEFAULT_TX)
  const [cuotasOn, setCuotasOn] = useState((initial?.cuotas ?? 1) > 1)
  const [saving, setSaving] = useState(false)

  // Default walletId to first available
  useEffect(() => {
    if (!form.walletId) {
      const first = [...wallets, ...cards][0]
      if (first) setForm(f => ({ ...f, walletId: first.id }))
    }
  }, [wallets, cards])

  const set = (key, val) => setForm(f => ({ ...f, [key]: val }))

  // CC billing notice
  const selectedCard = cards.find(c => c.id === form.walletId)
  const ccPeriod = selectedCard && form.type === 'expense' && form.date
    ? selectors.cardPeriod(selectedCard, form.date)
    : null

  const nCuotas = cuotasOn ? Number(form.cuotas) || 1 : 1
  const periodName = p => `${MONTHS_SHORT[p.month]} ${p.year}`
  const lastPeriod = ccPeriod && nCuotas > 1 ? selectors.addMonths(ccPeriod, nCuotas - 1) : null

  // Cuota hint
  const cuotaHint = cuotasOn && form.cuotas > 1
    ? `Cuota ${form.cuotaActual} de ${form.cuotas} — ${fmt2(Number(form.amount) / form.cuotas)} c/u`
    : null

  async function handleSave() {
    if (!form.amount || Number(form.amount) <= 0) return alert('Ingresá un monto válido')
    if (!form.date) return alert('Seleccioná una fecha')
    if (!form.walletId) return alert('Seleccioná un medio de pago')

    setSaving(true)
    await saveTransaction({
      ...form,
      id: initial?.id,
      amount: Number(form.amount),
      cuotas: cuotasOn ? Number(form.cuotas) || 1 : 1,
      cuotaActual: cuotasOn ? Number(form.cuotaActual) || 1 : 1,
    })
    setSaving(false)
    onClose()
  }

  async function handleDelete() {
    if (!confirm('¿Eliminar esta transacción?')) return
    await deleteTransaction(initial.id)
    onClose()
  }

  const allPayments = [
    ...wallets.map(w => ({ id: w.id, label: `${w.icon || '💵'} ${w.name}` })),
    ...cards.map(c => ({ id: c.id, label: `${c.icon || '💳'} ${c.name} (TC)` })),
  ]

  return (
    <Modal title={isEdit ? 'Editar Transacción' : 'Nueva Transacción'} onClose={onClose} size="tall">
      <TypeToggle value={form.type} onChange={v => set('type', v)} />

      {/* Amount */}
      <div className={styles.amountGroup}>
        <label className={styles.amountLabel}>Monto</label>
        <div className={styles.amountWrap}>
          <span className={styles.amountPrefix}>$</span>
          <input
            className={styles.amountInput}
            type="number"
            inputMode="decimal"
            placeholder="0"
            value={form.amount}
            onChange={e => set('amount', e.target.value)}
            
          />
        </div>
      </div>

      <Input
        label="Descripción"
        placeholder="¿En qué?"
        value={form.desc}
        onChange={e => set('desc', e.target.value)}
      />

      <Input
        label="Fecha"
        type="date"
        value={form.date}
        onChange={e => set('date', e.target.value)}
      />

      {/* Category */}
      <div className={styles.formGroup}>
        <label className={styles.label}>Categoría</label>
        <div className={styles.catGrid}>
          {CATEGORIES.map(cat => (
            <div
              key={cat.id}
              className={`${styles.catBtn} ${form.category === cat.id ? styles.catBtnSelected : ''}`}
              onClick={() => set('category', cat.id)}
            >
              <span className={styles.catIcon}>{cat.icon}</span>
              <span className={styles.catLabel}>{cat.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Payment method */}
      <Select
        label="Medio de Pago"
        value={form.walletId}
        onChange={e => set('walletId', e.target.value)}
      >
        {allPayments.map(p => (
          <option key={p.id} value={p.id}>{p.label}</option>
        ))}
      </Select>

      {/* CC billing notice */}
      {ccPeriod && (
        <div className={styles.ccNotice}>
          📅 Se imputa al <strong>{ccPeriod.label}</strong>: resumen de{' '}
          <strong>{periodName(ccPeriod)}</strong> (cierra el {ccPeriod.closeDay})
          {lastPeriod && (
            <> · cuotas de {periodName(ccPeriod)} a {periodName(lastPeriod)}</>
          )}
        </div>
      )}

      {/* Cuotas (only for expenses) */}
      {form.type === 'expense' && (
        <div className={styles.cuotasSection}>
          <Switch
            label="Pagar en cuotas"
            checked={cuotasOn}
            onChange={v => { setCuotasOn(v); if (!v) set('cuotas', 1) }}
          />
          {cuotasOn && (
            <Input
              label="Cantidad de cuotas"
              type="number"
              inputMode="numeric"
              placeholder="12"
              min={2} max={60}
              value={form.cuotas}
              onChange={e => set('cuotas', e.target.value)}
              hint={form.cuotas > 1 ? `${fmt2(Number(form.amount) / Number(form.cuotas))} por cuota` : undefined}
            />
          )}
        </div>
      )}

      <div className={styles.actions}>
        {isEdit && (
          <Button variant="danger" size="sm" onClick={handleDelete}>Eliminar</Button>
        )}
        <Button variant="primary" size="lg" onClick={handleSave} disabled={saving} className={styles.saveBtn}>
          {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Registrar'}
        </Button>
      </div>
    </Modal>
  )
}