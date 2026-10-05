import { useState, useMemo } from 'react'
import { useStore, selectors } from '@/store'
import { Section, Card, Empty } from '@/components/ui'
import TxItem from '@/components/TxItem'
import TxModal from '@/components/modals/TxModal'
import styles from './Transactions.module.css'

const ALL = 'all'

export default function Transactions() {
  const { wallets, cards, transactions, currentMonth, currentYear } = useStore()
  const [filter, setFilter] = useState(ALL)
  const [editTx, setEditTx] = useState(null)

  const monthTx = useMemo(
    () => selectors.monthTransactions(transactions, currentMonth, currentYear),
    [transactions, currentMonth, currentYear]
  )

  const filtered = useMemo(() => {
    let list = monthTx
    if (filter === 'income')  list = list.filter(t => t.type === 'income')
    else if (filter === 'expense') list = list.filter(t => t.type === 'expense')
    else if (filter.startsWith('w:')) list = list.filter(t => t.walletId === filter.slice(2))
    else if (filter.startsWith('c:')) list = list.filter(t => t.walletId === filter.slice(2))
    return list.sort((a, b) => new Date(b.date) - new Date(a.date))
  }, [monthTx, filter])

  const filters = [
    { id: ALL,        label: 'Todos' },
    { id: 'income',   label: '↑ Ingresos' },
    { id: 'expense',  label: '↓ Egresos' },
    ...wallets.map(w => ({ id: `w:${w.id}`, label: `${w.icon || '💵'} ${w.name}` })),
    ...cards.map(c =>   ({ id: `c:${c.id}`, label: `${c.icon || '💳'} ${c.name}` })),
  ]

  return (
    <div className="animate-fadeUp">
      {/* Filter chips */}
      <div className={styles.chips}>
        {filters.map(f => (
          <button
            key={f.id}
            className={`${styles.chip} ${filter === f.id ? styles.chipActive : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card>
        {filtered.length === 0
          ? <Empty icon="🔍" text="Sin movimientos para este filtro" />
          : filtered.map(tx => (
            <TxItem
              key={tx.id}
              tx={tx}
              wallets={wallets}
              cards={cards}
              onClick={setEditTx}
            />
          ))
        }
      </Card>

      {editTx && <TxModal initial={editTx} onClose={() => setEditTx(null)} />}
    </div>
  )
}
