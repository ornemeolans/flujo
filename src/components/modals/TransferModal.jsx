import { useState } from 'react'
import { useStore, selectors } from '@/store'
import { Modal, Input, Select, Button } from '@/components/ui'
import { fmt2, today } from '@/utils'
import styles from './TransferModal.module.css'

export default function TransferModal({ onClose }) {
  const { wallets, transactions, transfer } = useStore()
  const [form, setForm] = useState({
    fromId: wallets[0]?.id || '',
    toId:   wallets[1]?.id || wallets[0]?.id || '',
    amount: '',
    date:   today(),
    desc:   '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const fromWallet = wallets.find(w => w.id === form.fromId)
  const toWallet   = wallets.find(w => w.id === form.toId)
  const fromBal    = fromWallet ? selectors.walletBalance(fromWallet, transactions) : 0

  async function handleSave() {
    if (!form.amount || Number(form.amount) <= 0) return alert('Ingresá un monto válido')
    if (!form.fromId || !form.toId)               return alert('Seleccioná las billeteras')
    if (form.fromId === form.toId)                return alert('Las billeteras deben ser distintas')
    setSaving(true)
    await transfer({
      fromId: form.fromId,
      toId:   form.toId,
      amount: Number(form.amount),
      date:   form.date,
      desc:   form.desc || 'Transferencia',
    })
    setSaving(false)
    onClose()
  }

  return (
    <Modal title="Transferir entre billeteras" onClose={onClose}>
      {/* Visual flow */}
      <div className={styles.flow}>
        <div className={styles.flowBox} style={{ borderColor: fromWallet?.color || 'var(--border2)' }}>
          <div className={styles.flowIcon}>{fromWallet?.icon || '💵'}</div>
          <div className={styles.flowName}>{fromWallet?.name || '—'}</div>
          <div className={styles.flowBal}>{fmt2(fromBal)}</div>
        </div>
        <div className={styles.flowArrow}>→</div>
        <div className={styles.flowBox} style={{ borderColor: toWallet?.color || 'var(--border2)' }}>
          <div className={styles.flowIcon}>{toWallet?.icon || '💵'}</div>
          <div className={styles.flowName}>{toWallet?.name || '—'}</div>
        </div>
      </div>

      <Select label="Desde" value={form.fromId} onChange={e => set('fromId', e.target.value)}>
        {wallets.map(w => (
          <option key={w.id} value={w.id}>{w.icon} {w.name}</option>
        ))}
      </Select>

      <Select label="Hacia" value={form.toId} onChange={e => set('toId', e.target.value)}>
        {wallets.filter(w => w.id !== form.fromId).map(w => (
          <option key={w.id} value={w.id}>{w.icon} {w.name}</option>
        ))}
      </Select>

      <Input
        label="Monto"
        type="number"
        inputMode="decimal"
        placeholder="0"
        prefix="$"
        value={form.amount}
        onChange={e => set('amount', e.target.value)}
      />

      <Input
        label="Fecha"
        type="date"
        value={form.date}
        onChange={e => set('date', e.target.value)}
      />

      <Input
        label="Descripción (opcional)"
        placeholder="Ej: Paso a efectivo"
        value={form.desc}
        onChange={e => set('desc', e.target.value)}
      />

      <div style={{ marginTop: 8 }}>
        <Button variant="primary" size="lg" onClick={handleSave} disabled={saving}>
          {saving ? 'Transfiriendo…' : 'Confirmar transferencia'}
        </Button>
      </div>
    </Modal>
  )
}