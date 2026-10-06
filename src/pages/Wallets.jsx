import { useState } from 'react'
import { useStore, selectors } from '@/store'
import { Section, Empty, pressable } from '@/components/ui'
import WalletModal    from '@/components/modals/WalletModal'
import CardModal      from '@/components/modals/CardModal'
import CardDetailModal from '@/components/modals/CardDetailModal'
import TransferModal  from '@/components/modals/TransferModal'
import PayCardModal   from '@/components/modals/PayCardModal'
import LoanModal      from '@/components/modals/LoanModal'
import styles from './Wallets.module.css'
import { fmt2, formatDate } from '@/utils'
import { loanStatus, localISO } from '@shared/loans'

export default function Wallets() {
  const { wallets, cards, transactions, loans } = useStore()
  const [editWallet,   setEditWallet]   = useState(null)  // wallet obj | {}
  const [editCard,     setEditCard]     = useState(null)  // card obj   | {}
  const [detailCard,   setDetailCard]   = useState(null)  // card obj — show detail
  const [transferOpen, setTransferOpen] = useState(false)
  const [payingCard,   setPayingCard]   = useState(null)  // card obj
  const [editLoan,     setEditLoan]     = useState(null)  // loan obj   | {}

  function openCardDetail(card)  { setDetailCard(card) }
  function openCardEdit(card)    { setDetailCard(null); setEditCard(card) }
  function openCardPay(card)     { setDetailCard(null); setPayingCard(card) }

  return (
    <div className="animate-fadeUp">
      <Section title="Mis Billeteras" action="+ Nueva" onAction={() => setEditWallet({})}>
        {wallets.length === 0
          ? <Empty icon="🏦" text="Agregá tu primera billetera" action="+ Agregar" onAction={() => setEditWallet({})} />
          : wallets.map(w => (
              <WalletCard key={w.id} wallet={w} transactions={transactions} onClick={() => setEditWallet(w)} />
            ))
        }
        {wallets.length >= 2 && (
          <button className={styles.transferBtn} onClick={() => setTransferOpen(true)}>
            ↔ Transferir entre billeteras
          </button>
        )}
      </Section>

      <Section title="Tarjetas de Crédito" action="+ Nueva" onAction={() => setEditCard({})}>
        {cards.length === 0
          ? <Empty icon="💳" text="Agregá una tarjeta de crédito" action="+ Agregar" onAction={() => setEditCard({})} />
          : cards.map(c => (
              <CCCard
                key={c.id} card={c} transactions={transactions}
                onClick={() => openCardDetail(c)}
                onPay={() => openCardPay(c)}
              />
            ))
        }
      </Section>

      <Section title="Préstamos" action="+ Nuevo" onAction={() => setEditLoan({})}>
        {loans.length === 0
          ? <Empty icon="🏛️" text="Cargá un préstamo y sus cuotas se debitan solas al vencer" action="+ Agregar" onAction={() => setEditLoan({})} />
          : loans.map(l => (
              <LoanCard key={l.id} loan={l} wallets={wallets} transactions={transactions} onClick={() => setEditLoan(l)} />
            ))
        }
      </Section>

      {editWallet  !== null && <WalletModal  initial={editWallet.id ? editWallet : null} onClose={() => setEditWallet(null)} />}
      {editCard    !== null && <CardModal    initial={editCard.id   ? editCard   : null} onClose={() => setEditCard(null)} />}
      {detailCard           && (
        <CardDetailModal
          card={detailCard}
          onClose={() => setDetailCard(null)}
          onEdit={() => openCardEdit(detailCard)}
          onPay={() => openCardPay(detailCard)}
        />
      )}
      {transferOpen         && <TransferModal onClose={() => setTransferOpen(false)} />}
      {payingCard           && <PayCardModal card={payingCard} onClose={() => setPayingCard(null)} />}
      {editLoan    !== null && <LoanModal    initial={editLoan.id   ? editLoan   : null} onClose={() => setEditLoan(null)} />}
    </div>
  )
}

function WalletCard({ wallet, transactions, onClick }) {
  const bal    = selectors.walletBalance(wallet, transactions)
  const yield_ = selectors.walletMonthlyYield(wallet, transactions)
  return (
    <div className={styles.walletCard} {...pressable(onClick)}>
      <div className={styles.icon} style={{ background: `${wallet.color||'#178C9E'}18`, color: wallet.color||'#178C9E' }}>
        {wallet.icon || '💵'}
      </div>
      <div className={styles.info}>
        <div className={styles.name}>{wallet.name}</div>
        <div className={styles.sub}>{walletTypeLabel(wallet.type)}</div>
        {wallet.tnaEnabled && <div className={styles.tna}>TNA {wallet.tna}%</div>}
      </div>
      <div className={styles.right}>
        <div className={`${styles.bal} ${bal < 0 ? styles.neg : ''}`}>{fmt2(bal)}</div>
        {yield_ > 0 && <div className={styles.yield}>+{fmt2(yield_)}/mes</div>}
      </div>
    </div>
  )
}

function CCCard({ card, transactions, onClick, onPay }) {
  const { currentMonth: m, currentYear: y } = useStore()
  const nextM = m === 11 ? 0 : m + 1
  const nextY = m === 11 ? y + 1 : y
  const current = selectors.cardPeriodTotal(card, transactions, m, y)
  const next    = selectors.cardPeriodTotal(card, transactions, nextM, nextY)
  return (
    <div className={styles.ccCard}>
      <div className={styles.ccHead} {...pressable(onClick)}>
        <div className={styles.icon} style={{ background: `${card.color||'#A3296B'}18`, color: card.color||'#A3296B' }}>
          {card.icon || '💳'}
        </div>
        <div className={styles.info}>
          <div className={styles.name}>{card.name}</div>
          <div className={styles.sub}>Cierra el día {card.closeDay} · Toca para ver consumos</div>
        </div>
      </div>
      <div className={styles.ccPills}>
        <div className={styles.ccPill}>
          <div className={styles.pillLbl}>Resumen actual</div>
          <div className={styles.pillVal} style={{ color: 'var(--red)' }}>{fmt2(current)}</div>
        </div>
        <div className={styles.ccPill}>
          <div className={styles.pillLbl}>Próximo resumen</div>
          <div className={styles.pillVal} style={{ color: 'var(--text2)' }}>{fmt2(next)}</div>
        </div>
      </div>
      {current > 0 && (
        <button className={styles.payBtn} onClick={e => { e.stopPropagation(); onPay() }}>
          Pagar resumen — {fmt2(current)}
        </button>
      )}
    </div>
  )
}

function LoanCard({ loan, wallets, transactions, onClick }) {
  const status = loanStatus(loan, transactions)
  const wallet = wallets.find(w => w.id === loan.walletId)
  const today  = localISO()
  const overdue = status.next && status.next.date < today
  return (
    <div className={styles.ccCard} {...pressable(onClick)}>
      <div className={styles.ccHead}>
        <div className={styles.icon} style={{ background: 'var(--purple-dim)', color: 'var(--purple)' }}>🏛️</div>
        <div className={styles.info}>
          <div className={styles.name}>{loan.name}</div>
          <div className={styles.sub}>
            {status.done ? 'Pagado ✓' : `Cuota ${status.next.n} de ${status.total} · Débito desde ${wallet?.name ?? 'billetera eliminada'}`}
          </div>
        </div>
      </div>
      <div className={styles.loanBar}><div style={{ width: `${(status.paid / status.total) * 100}%` }} /></div>
      {!status.done && (
        <div className={styles.ccPills}>
          <div className={styles.ccPill}>
            <div className={styles.pillLbl}>{overdue ? 'Vencida sin debitar' : `Vence ${formatDate(status.next.date)}`}</div>
            <div className={styles.pillVal} style={{ color: 'var(--red)' }}>{fmt2(status.next.amount)}</div>
          </div>
          <div className={styles.ccPill}>
            <div className={styles.pillLbl}>Resta pagar</div>
            <div className={styles.pillVal} style={{ color: 'var(--text2)' }}>{fmt2(status.remaining)}</div>
          </div>
        </div>
      )}
    </div>
  )
}

function walletTypeLabel(type) {
  const map = { cash: 'Efectivo', virtual: 'Virtual', bank: 'Banco', savings: 'Inversión', other: 'Otro' }
  return map[type] ?? type
}