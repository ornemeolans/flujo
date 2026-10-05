import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { Modal, Input, Select, Switch, Button, ColorGrid, IconGrid } from '@/components/ui'
import { WALLET_TYPES, WALLET_ICONS, PALETTE, fmt2 } from '@/utils'
import styles from './WalletModal.module.css'

const DEFAULT = {
  name: '', type: 'cash', initialBalance: '',
  icon: '💵', color: '#c8f55a',
  tnaEnabled: false, tna: '',
}

export default function WalletModal({ onClose, initial = null }) {
  const { saveWallet, deleteWallet } = useStore()
  const isEdit = !!initial
  const [form, setForm] = useState(initial ? {
    ...initial,
    initialBalance: String(initial.initialBalance ?? 0),
    tna: String(initial.tna ?? ''),
  } : DEFAULT)
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const monthlyYield = form.tnaEnabled && form.tna && form.initialBalance
    ? Number(form.initialBalance) * (Number(form.tna) / 100 / 12)
    : null

  async function handleSave() {
    if (!form.name.trim()) return alert('Ingresá un nombre')
    setSaving(true)
    await saveWallet({
      ...form,
      id: initial?.id,
      initialBalance: Number(form.initialBalance) || 0,
      tna: Number(form.tna) || 0,
    })
    setSaving(false)
    onClose()
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar "${form.name}"? Se borrarán también sus transacciones.`)) return
    await deleteWallet(initial.id)
    onClose()
  }

  return (
    <Modal title={isEdit ? 'Editar Billetera' : 'Nueva Billetera'} onClose={onClose}>
      <Input
        label="Nombre"
        placeholder="Ej: Mercado Pago"
        value={form.name}
        onChange={e => set('name', e.target.value)}
      />

      <Select label="Tipo" value={form.type} onChange={e => set('type', e.target.value)}>
        {WALLET_TYPES.map(t => (
          <option key={t.id} value={t.id}>{t.icon} {t.label}</option>
        ))}
      </Select>

      <Input
        label="Saldo Inicial"
        type="number"
        inputMode="decimal"
        placeholder="0"
        prefix="$"
        value={form.initialBalance}
        onChange={e => set('initialBalance', e.target.value)}
      />

      <div className={styles.formGroup}>
        <label className={styles.label}>Ícono</label>
        <IconGrid icons={WALLET_ICONS} selected={form.icon} onSelect={v => set('icon', v)} />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Color</label>
        <ColorGrid colors={PALETTE} selected={form.color} onSelect={v => set('color', v)} />
      </div>

      <Switch
        label="Tiene rendimiento (TNA)"
        checked={form.tnaEnabled}
        onChange={v => set('tnaEnabled', v)}
      />

      {form.tnaEnabled && (
        <Input
          label="TNA (%)"
          type="number"
          inputMode="decimal"
          placeholder="Ej: 120"
          step="0.1"
          value={form.tna}
          onChange={e => set('tna', e.target.value)}
          hint={monthlyYield != null ? `Rendimiento est. mensual: +${fmt2(monthlyYield)}` : undefined}
        />
      )}

      <div className={styles.actions}>
        {isEdit && (
          <Button variant="danger" size="sm" onClick={handleDelete}>Eliminar</Button>
        )}
        <Button variant="primary" size="lg" onClick={handleSave} disabled={saving} className={styles.saveBtn}>
          {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Crear billetera'}
        </Button>
      </div>
    </Modal>
  )
}