import { useState, useMemo, Fragment } from 'react'
import { useStore } from '@/store'
import { Modal, Input, Select, Switch, Button } from '@/components/ui'
import { fmt2, formatDate } from '@/utils'
import { localISO, loanDueDate, loanCuotaAmount, sortedRateChanges, tnaForCuota } from '@shared/loans'
import styles from './LoanModal.module.css'

const DEFAULT = {
  name: '', principal: '', cuotas: '', paidBefore: '0',
  mode: 'fixed', cuotaAmount: '', tna: '', iva: true,
  firstDue: '', walletId: '',
  credited: true, creditDate: localISO(),
}

export default function LoanModal({ onClose, initial = null }) {
  const { wallets, transactions, saveLoan, deleteLoan } = useStore()
  const isEdit = !!initial
  const [form, setForm] = useState(initial ? {
    ...initial,
    principal: String(initial.principal ?? ''),
    cuotas: String(initial.cuotas ?? ''),
    paidBefore: String(initial.paidBefore ?? 0),
    cuotaAmount: String(initial.cuotaAmount ?? ''),
    tna: String(initial.tna ?? ''),
    creditDate: initial.creditDate || localISO(),
  } : { ...DEFAULT, walletId: wallets[0]?.id || '' })
  const [saving, setSaving] = useState(false)
  const [showSchedule, setShowSchedule] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Préstamo con los valores numéricos, para calcular el cronograma en vivo
  const loan = useMemo(() => ({
    ...form,
    id: initial?.id ?? 'preview',
    principal: Number(form.principal) || 0,
    cuotas: Math.max(0, Math.floor(Number(form.cuotas) || 0)),
    paidBefore: Math.max(0, Math.floor(Number(form.paidBefore) || 0)),
    cuotaAmount: Number(form.cuotaAmount) || 0,
    tna: Number(form.tna) || 0,
  }), [form, initial])

  const valid = loan.cuotas > 0 && loan.paidBefore < loan.cuotas && !!form.firstDue &&
    (loan.mode === 'fixed' ? loan.cuotaAmount > 0 : loan.principal > 0)

  const schedule = useMemo(() => {
    if (!valid) return []
    // Cuotas ya debitadas: se muestran con el monto que efectivamente se debitó
    const debited = new Map(transactions.filter(t => t.loanId === loan.id && t.loanCuota).map(t => [t.loanCuota, t]))
    const out = []
    for (let n = loan.paidBefore + 1; n <= loan.cuotas; n++) {
      const tx = debited.get(n)
      out.push({ n, date: tx?.date ?? loanDueDate(loan, n), amount: tx?.amount ?? loanCuotaAmount(loan, n), paid: !!tx })
    }
    return out
  }, [loan, valid, transactions])

  const todayStr = localISO()
  const first = schedule.find(c => !c.paid)
  const overdue = !isEdit ? schedule.filter(c => c.date <= todayStr) : []
  const pending = schedule.filter(c => !c.paid)
  const totalToPay = pending.reduce((s, c) => s + c.amount, 0)
  const totalCost = schedule.reduce((s, c) => s + c.amount, 0)
  const wallet = wallets.find(w => w.id === form.walletId)
  const canCredit = loan.paidBefore === 0

  // ─── Cambios de tasa (modo TNA) ───
  const rateChanges = sortedRateChanges(form)
  const [newRate, setNewRate] = useState({ fromCuota: '', tna: '' })
  // Solo desde la primera cuota sin debitar (y nunca la 1: esa es la TNA inicial)
  const minChangeCuota = Math.max(2, first?.n ?? loan.cuotas + 1)

  function addRateChange() {
    const fromCuota = Math.floor(Number(newRate.fromCuota) || minChangeCuota)
    const tna = Number(newRate.tna)
    if (!(tna >= 0) || newRate.tna === '') return alert('Ingresá la nueva TNA')
    if (fromCuota < minChangeCuota || fromCuota > loan.cuotas) {
      return alert(`La cuota tiene que estar entre ${minChangeCuota} y ${loan.cuotas}`)
    }
    set('rateChanges', [...rateChanges.filter(c => c.fromCuota !== fromCuota), { fromCuota, tna }])
    setNewRate({ fromCuota: '', tna: '' })
    setShowSchedule(true)
  }

  function removeRateChange(fromCuota) {
    set('rateChanges', rateChanges.filter(c => c.fromCuota !== fromCuota))
  }

  async function handleSave() {
    if (!form.name.trim()) return alert('Ingresá un nombre para el préstamo')
    if (!form.walletId) return alert('Elegí la billetera de donde se debitan las cuotas')
    if (!valid) return alert('Completá cuotas, vencimiento y el valor de la cuota (o la TNA y el monto)')
    if (overdue.length && !confirm(`Hay ${overdue.length} cuota(s) con vencimiento pasado. Se van a registrar como debitadas de "${wallet?.name}". Si ya las tenías cargadas, indicá cuántas pagaste en "Cuotas ya pagadas". ¿Continuar?`)) return
    setSaving(true)
    await saveLoan({
      ...form,
      id: initial?.id,
      name: form.name.trim(),
      principal: loan.principal,
      cuotas: loan.cuotas,
      paidBefore: loan.paidBefore,
      cuotaAmount: loan.cuotaAmount,
      tna: loan.tna,
      credited: canCredit && form.credited,
    })
    setSaving(false)
    onClose()
  }

  async function handleDelete() {
    if (!confirm(`¿Eliminar "${form.name}"? Dejan de debitarse las cuotas. Los movimientos ya registrados quedan en tu historial.`)) return
    await deleteLoan(initial.id)
    onClose()
  }

  if (!wallets.length) {
    return (
      <Modal title="Nuevo Préstamo" onClose={onClose}>
        <p className={styles.notice}>Primero creá una billetera: es de donde se van a debitar las cuotas.</p>
      </Modal>
    )
  }

  return (
    <Modal title={isEdit ? 'Editar Préstamo' : 'Nuevo Préstamo'} onClose={onClose}>
      <Input
        label="Nombre"
        placeholder="Ej: Préstamo personal Banco Nación"
        value={form.name}
        onChange={e => set('name', e.target.value)}
      />

      <div className={styles.row}>
        <Input
          label="Monto pedido"
          type="number" inputMode="decimal" prefix="$" placeholder="0"
          value={form.principal}
          onChange={e => set('principal', e.target.value)}
        />
        <Input
          label="Cuotas"
          type="number" inputMode="numeric" placeholder="Ej: 12"
          value={form.cuotas}
          onChange={e => set('cuotas', e.target.value)}
        />
      </div>

      <div className={styles.formGroup}>
        <label className={styles.label}>Valor de la cuota</label>
        <div className={styles.segmented}>
          <button type="button" aria-pressed={form.mode === 'fixed'} className={form.mode === 'fixed' ? styles.segOn : ''} onClick={() => set('mode', 'fixed')}>
            La sé
          </button>
          <button type="button" aria-pressed={form.mode === 'tna'} className={form.mode === 'tna' ? styles.segOn : ''} onClick={() => set('mode', 'tna')}>
            Calcular con la TNA
          </button>
        </div>
      </div>

      {form.mode === 'fixed' ? (
        <Input
          label="Cuota mensual"
          type="number" inputMode="decimal" prefix="$" placeholder="0"
          value={form.cuotaAmount}
          onChange={e => set('cuotaAmount', e.target.value)}
          hint="La que figura en tu home banking (con IVA y seguros). Si es UVA, actualizala cuando cambie."
        />
      ) : (
        <>
          <Input
            label={rateChanges.length ? 'TNA inicial (%)' : 'TNA (%)'}
            type="number" inputMode="decimal" step="0.1" placeholder="Ej: 75"
            value={form.tna}
            onChange={e => set('tna', e.target.value)}
            hint="Sistema francés: la cuota pura es fija y al principio paga más interés."
          />
          <Switch label="Sumar IVA (21%) sobre los intereses" checked={form.iva} onChange={v => set('iva', v)} />

          {valid && (
            <div className={styles.formGroup}>
              <label className={styles.label}>Cambios de tasa</label>
              {rateChanges.map(c => (
                <div key={c.fromCuota} className={styles.rateRow}>
                  <span>Desde la cuota {c.fromCuota}: <strong>TNA {c.tna}%</strong></span>
                  {c.fromCuota >= minChangeCuota && (
                    <button type="button" className={styles.rateRemove} onClick={() => removeRateChange(c.fromCuota)} aria-label="Quitar cambio de tasa">✕</button>
                  )}
                </div>
              ))}
              {minChangeCuota <= loan.cuotas ? (
                <div className={styles.rateAdd}>
                  <Input
                    label="Desde la cuota"
                    type="number" inputMode="numeric"
                    placeholder={String(minChangeCuota)}
                    value={newRate.fromCuota}
                    onChange={e => setNewRate(r => ({ ...r, fromCuota: e.target.value }))}
                  />
                  <Input
                    label="Nueva TNA (%)"
                    type="number" inputMode="decimal" step="0.1" placeholder="Ej: 90"
                    value={newRate.tna}
                    onChange={e => setNewRate(r => ({ ...r, tna: e.target.value }))}
                  />
                  <Button variant="ghost" size="md" type="button" onClick={addRateChange} className={styles.rateAddBtn}>Aplicar</Button>
                </div>
              ) : (
                <span className={styles.summarySub}>No quedan cuotas sin debitar.</span>
              )}
              <span className={styles.summarySub}>
                Las cuotas que faltan se recalculan sobre el capital que debés a ese momento. Las ya debitadas no cambian.
              </span>
            </div>
          )}
        </>
      )}

      <div className={styles.row}>
        <Input
          label={loan.paidBefore > 0 ? 'Próximo vencimiento' : '1er vencimiento'}
          type="date"
          value={form.firstDue}
          onChange={e => set('firstDue', e.target.value)}
        />
        <Input
          label="Cuotas ya pagadas"
          type="number" inputMode="numeric" placeholder="0"
          value={form.paidBefore}
          onChange={e => set('paidBefore', e.target.value)}
        />
      </div>

      <Select
        label="Se debita de"
        value={form.walletId}
        onChange={e => set('walletId', e.target.value)}
      >
        {wallets.map(w => <option key={w.id} value={w.id}>{w.icon} {w.name}</option>)}
      </Select>

      {canCredit && (
        <>
          <Switch
            label="Acreditar el monto en la billetera"
            checked={form.credited}
            onChange={v => set('credited', v)}
          />
          {form.credited && (
            <Input
              label="Fecha de acreditación"
              type="date"
              value={form.creditDate}
              onChange={e => set('creditDate', e.target.value)}
              hint={loan.principal > 0 ? `Suma ${fmt2(loan.principal)} al saldo de ${wallet?.name ?? 'la billetera'}` : 'Cargá el monto pedido'}
            />
          )}
        </>
      )}

      {valid && first && (
        <div className={styles.summary}>
          <div>
            Próxima cuota: <strong>{fmt2(first.amount)}</strong> el <strong>{formatDate(first.date)}</strong>,
            se debita de {wallet?.name}.
          </div>
          <div className={styles.summarySub}>
            {pending.length} cuota(s) por pagar · Restan {fmt2(totalToPay)}
            {loan.paidBefore === 0 && loan.principal > 0 && totalCost > loan.principal &&
              ` · Costo total del préstamo (intereses${form.mode === 'tna' && form.iva ? ' + IVA' : ''}): ${fmt2(totalCost - loan.principal)}`}
          </div>
          <div className={styles.summarySub}>Si vence sábado o domingo, se debita el lunes siguiente.</div>
          <button type="button" className={styles.linkBtn} onClick={() => setShowSchedule(s => !s)}>
            {showSchedule ? 'Ocultar cronograma' : 'Ver cronograma'}
          </button>
          {showSchedule && (
            <div className={styles.schedule}>
              {schedule.map(c => (
                <Fragment key={c.n}>
                  {form.mode === 'tna' && rateChanges.some(r => r.fromCuota === c.n) && (
                    <div className={styles.schedRate}>Desde acá: TNA {tnaForCuota(loan, c.n)}%</div>
                  )}
                  <div className={`${styles.schedRow} ${c.paid ? styles.schedPaid : ''}`}>
                    <span>{c.n}/{loan.cuotas}</span>
                    <span>{formatDate(c.date)} {c.date.slice(0, 4)}</span>
                    <span>{fmt2(c.amount)}{c.paid ? ' ✓' : ''}</span>
                  </div>
                </Fragment>
              ))}
            </div>
          )}
        </div>
      )}

      <div className={styles.actions}>
        {isEdit && <Button variant="danger" size="sm" onClick={handleDelete}>Eliminar</Button>}
        <Button variant="primary" size="lg" onClick={handleSave} disabled={saving} className={styles.saveBtn}>
          {saving ? 'Guardando…' : isEdit ? 'Guardar cambios' : 'Agregar préstamo'}
        </Button>
      </div>
    </Modal>
  )
}
