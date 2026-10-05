import { useState } from 'react'
import { useStore, selectors } from '@/store'
import { Section, Empty } from '@/components/ui'
import WalletModal    from '@/components/modals/WalletModal'
import CardModal      from '@/components/modals/CardModal'
import CardDetailModal from '@/components/modals/CardDetailModal'
import TransferModal  from '@/components/modals/TransferModal'
import PayCardModal   from '@/components/modals/PayCardModal'
import styles from './Wallets.module.css'
import { fmt2 } from '@/utils'

export default function Wallets() {
  const { wallets, cards, transactions } = useStore()
  const [editWallet,   setEditWallet]   = useState(null)  // wallet obj | {}
  const [editCard,     setEditCard]     = useState(null)  // card obj   | {}
  const [detailCard,   setDetailCard]   = useState(null)  // card obj — show detail
  const [transferOpen, setTransferOpen] = useState(false)
  const [payingCard,   setPayingCard]   = useState(null)  // card obj

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
    </div>
  )
}

function WalletCard({ wallet, transactions, onClick }) {
  const bal    = selectors.walletBalance(wallet, transactions)
  const yield_ = selectors.walletMonthlyYield(wallet, transactions)
  return (
    <div className={styles.walletCard} onClick={onClick}>
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
      <div className={styles.ccHead} onClick={onClick}>
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

function walletTypeLabel(type) {
  const map = { cash: 'Efectivo', virtual: 'Virtual', bank: 'Banco', savings: 'Inversión', other: 'Otro' }
  return map[type] ?? type
}