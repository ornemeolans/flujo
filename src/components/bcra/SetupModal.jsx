import { useState } from 'react'
import { useStore } from '@/store'
import { Modal, Button, Input, Switch } from '@/components/ui'
import { PALETTE } from '@/utils'
import { EntityPicker } from './EntityPicker'
import { useCatalog } from './useCatalog'
import { walletFromEntity, cardFromProduct } from './AddFlows'
import styles from './Bcra.module.css'

const validDay = d => Number.isInteger(Number(d)) && Number(d) >= 1 && Number(d) <= 31

/** Primera configuración: elegir todos los bancos y tarjetas de una vez */
export default function SetupModal({ onClose }) {
  const catalog = useCatalog()
  const { saveWallet, saveCard } = useStore()
  const [step, setStep] = useState('pick')
  const [chosen, setChosen] = useState([]) // entidades en el orden en que se eligieron
  const [details, setDetails] = useState({}) // por código: { account, balance, tnaOn, tna, cards: { nombre: díaCierre } }
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)

  const selected = new Set(chosen.map(e => e.code))
  function toggle(entity) {
    setChosen(list => (selected.has(entity.code) ? list.filter(e => e.code !== entity.code) : [...list, entity]))
    setDetails(d => d[entity.code] ? d : { ...d, [entity.code]: { account: entity.hasAccounts || entity.kind === 'virtual', balance: '', tnaOn: false, tna: '', cards: {} } })
  }
  const update = (code, patch) => setDetails(d => ({ ...d, [code]: { ...d[code], ...patch } }))
  const toggleCard = (code, name) => setDetails(d => {
    const cards = { ...d[code].cards }
    if (name in cards) delete cards[name]
    else cards[name] = ''
    return { ...d, [code]: { ...d[code], cards } }
  })

  async function save() {
    for (const entity of chosen) {
      const d = details[entity.code]
      const missing = Object.entries(d.cards).find(([, day]) => !validDay(day))
      if (missing) return setError(`Falta el día de cierre (1 a 31) de ${missing[0]} de ${entity.name}.`)
      if (d.account && d.tnaOn && !(Number(d.tna) > 0)) return setError(`Ingresá la TNA de ${entity.name}.`)
    }
    setError(null)
    setSaving(true)
    let i = 0
    for (const entity of chosen) {
      const d = details[entity.code]
      const color = PALETTE[i++ % PALETTE.length]
      if (d.account) {
        await saveWallet({ ...walletFromEntity(entity), color, initialBalance: Number(d.balance) || 0, tnaEnabled: d.tnaOn, tna: d.tnaOn ? Number(d.tna) : 0 })
      }
      for (const [name, day] of Object.entries(d.cards)) {
        const product = entity.cards.find(c => c.name === name)
        await saveCard({ ...cardFromProduct(entity, product), color, closeDay: Number(day) })
      }
    }
    setSaving(false)
    onClose()
  }

  if (step === 'pick') {
    return (
      <Modal title="Tus bancos y billeteras" onClose={onClose} size="tall">
        <p className={styles.lead}>Marcá todos los que usás. En el paso siguiente cargás saldos, tarjetas y fechas de cierre.</p>
        <EntityPicker catalog={catalog} mode="multi" selected={selected} onToggle={toggle} />
        <div className={styles.footer}>
          <Button variant="primary" size="lg" disabled={!chosen.length} onClick={() => setStep('details')}>
            {chosen.length ? `Continuar con ${chosen.length}` : 'Elegí al menos uno'}
          </Button>
        </div>
      </Modal>
    )
  }

  return (
    <Modal title="Saldos y tarjetas" onClose={onClose} size="tall">
      <p className={styles.lead}>La TNA y el cierre de las tarjetas no los publica el BCRA: cargalos vos. El cierre de un mes puntual lo podés ajustar después desde la tarjeta.</p>
      {chosen.map(entity => {
        const d = details[entity.code]
        return (
          <section key={entity.code} className={styles.entityBlock} aria-label={entity.name}>
            <h3 className={styles.entityTitle}>{entity.kind === 'virtual' ? '📱' : '🏦'} {entity.name}</h3>
            <Switch label="Tengo cuenta acá" checked={d.account} onChange={v => update(entity.code, { account: v })} />
            {d.account && (
              <>
                <Input label="Saldo actual" type="number" inputMode="decimal" placeholder="0" prefix="$" value={d.balance} onChange={e => update(entity.code, { balance: e.target.value })} />
                <Switch label="Rinde intereses (TNA)" checked={d.tnaOn} onChange={v => update(entity.code, { tnaOn: v })} />
                {d.tnaOn && <Input label="TNA (%)" type="number" inputMode="decimal" step="0.1" placeholder="Ej: 19" value={d.tna} onChange={e => update(entity.code, { tna: e.target.value })} />}
              </>
            )}
            {entity.cards.length > 0 && (
              <>
                <h4 className={styles.subTitle}>Tarjetas de crédito</h4>
                <div className={styles.cardList}>
                  {Object.keys(d.cards).map(name => (
                    <div key={name} className={styles.cardRow}>
                      <span className={styles.cardChosen}>💳 {name}</span>
                      <input
                        className={styles.dayInput}
                        type="number" inputMode="numeric" min={1} max={31} placeholder="Cierre"
                        aria-label={`Día de cierre de ${name}`}
                        value={d.cards[name]}
                        onChange={e => update(entity.code, { cards: { ...d.cards, [name]: e.target.value } })}
                      />
                      <button type="button" className={styles.remove} aria-label={`Quitar ${name}`} onClick={() => toggleCard(entity.code, name)}>×</button>
                    </div>
                  ))}
                </div>
                {entity.cards.some(p => !(p.name in d.cards)) && (
                  <select
                    className={styles.select}
                    aria-label={`Agregar tarjeta de ${entity.name}`}
                    value=""
                    onChange={e => e.target.value && toggleCard(entity.code, e.target.value)}
                  >
                    <option value="">+ Agregar tarjeta</option>
                    {entity.cards.filter(p => !(p.name in d.cards)).map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                  </select>
                )}
              </>
            )}
          </section>
        )
      })}
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.footer}>
        <button type="button" className={styles.back} onClick={() => setStep('pick')}>‹ Volver</button>
        <Button variant="primary" size="lg" onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar todo'}</Button>
      </div>
    </Modal>
  )
}
