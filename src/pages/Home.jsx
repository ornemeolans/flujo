import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, selectors } from '@/store'
import { fmt2, fmt, MONTHS_SHORT } from '@/utils'
import { Section, Card, Empty } from '@/components/ui'
import TxItem from '@/components/TxItem'
import WalletModal from '@/components/modals/WalletModal'
import CardModal from '@/components/modals/CardModal'
import TxModal from '@/components/modals/TxModal'
import styles from './Home.module.css'

export default function Home() {
  const navigate = useNavigate()
  const { wallets, cards, transactions, currentMonth, currentYear } = useStore()
  const [editWallet, setEditWallet] = useState(null)
  const [editCard, setEditCard]     = useState(null)
  const [editTx, setEditTx]         = useState(null)

  const totalBalance  = selectors.totalBalance(wallets, transactions)
  const totalYield    = selectors.totalMonthlyYield(wallets, transactions)
  const { income, expense } = selectors.monthTotals(transactions, currentMonth, currentYear)

  const recentTx = [...transactions]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, 6)

  return (
    <div className="animate-fadeUp">
      {/* Summary hero */}
      <div className={styles.hero}>
        <div className={styles.heroLabel}>Saldo Total</div>
        <div className={`${styles.heroAmount} ${totalBalance < 0 ? styles.neg : styles.pos}`}>
          {fmt2(totalBalance)}
        </div>
        {totalYield > 0 && (
          <div className={styles.heroYield}>
            Rendimiento estimado este mes: +{fmt2(totalYield)}
          </div>
        )}
        <div className={styles.heroPills}>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>Ingresos</span>
            <span className={`${styles.pillVal} ${styles.pillInc}`}>{fmt2(income)}</span>
          </div>
          <div className={styles.pill}>
            <span className={styles.pillLabel}>Egresos</span>
            <span className={`${styles.pillVal} ${styles.pillExp}`}>{fmt2(expense)}</span>
          </div>
        </div>
      </div>

      {/* Wallets */}
      <Section
        title="Billeteras"
        action="Ver todo →"
        onAction={() => navigate('/wallets')}
      >
        {wallets.length === 0
          ? <Empty icon="🏦" text="Sin billeteras" action="+ Agregar" onAction={() => setEditWallet({})} />
          : wallets.slice(0, 3).map(w => (
            <WalletRow
              key={w.id}
              wallet={w}
              transactions={transactions}
              onClick={() => setEditWallet(w)}
            />
          ))
        }
      </Section>

      {/* Credit Cards */}
      <Section
        title="Tarjetas de Crédito"
        action="Ver todo →"
        onAction={() => navigate('/wallets')}
      >
        {cards.length === 0
          ? <Empty icon="💳" text="Sin tarjetas" action="+ Agregar" onAction={() => setEditCard({})} />
          : cards.slice(0, 2).map(card => (
            <CCRow
              key={card.id}
              card={card}
              transactions={transactions}
              currentMonth={currentMonth}
              currentYear={currentYear}
              onClick={() => setEditCard(card)}
            />
          ))
        }
      </Section>

      {/* Recent transactions */}
      <Section
        title="Últimas Transacciones"
        action="Ver todo →"
        onAction={() => navigate('/transactions')}
      >
        <Card>
          {recentTx.length === 0
            ? <Empty icon="💸" text="Sin transacciones aún" />
            : recentTx.map(tx => (
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
      </Section>

      {editWallet !== null && (
        <WalletModal
          initial={editWallet.id ? editWallet : null}
          onClose={() => setEditWallet(null)}
        />
      )}
      {editCard !== null && (
        <CardModal
          initial={editCard.id ? editCard : null}
          onClose={() => setEditCard(null)}
        />
      )}
      {editTx && (
        <TxModal initial={editTx} onClose={() => setEditTx(null)} />
      )}
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────
function WalletRow({ wallet, transactions, onClick }) {
  const bal    = selectors.walletBalance(wallet, transactions)
  const yield_ = selectors.walletMonthlyYield(wallet, transactions)
  return (
    <div className={styles.walletRow} onClick={onClick}>
      <div className={styles.walletIcon} style={{ background: `${wallet.color || '#178C9E'}18`, color: wallet.color || '#178C9E' }}>
        {wallet.icon || '💵'}
      </div>
      <div className={styles.walletInfo}>
        <div className={styles.walletName}>{wallet.name}</div>
        {wallet.tnaEnabled && <div className={styles.walletTna}>TNA {wallet.tna}%</div>}
      </div>
      <div className={styles.walletRight}>
        <div className={`${styles.walletBal} ${bal < 0 ? styles.neg : ''}`}>{fmt2(bal)}</div>
        {yield_ > 0 && <div className={styles.walletYield}>+{fmt2(yield_)}/mes</div>}
      </div>
    </div>
  )
}

function CCRow({ card, transactions, currentMonth, currentYear, onClick }) {
  const current = selectors.cardPeriodTotal(card, transactions, currentMonth, currentYear)
  const nextM = currentMonth === 11 ? 0 : currentMonth + 1
  const nextY = currentMonth === 11 ? currentYear + 1 : currentYear
  const next  = selectors.cardPeriodTotal(card, transactions, nextM, nextY)

  return (
    <div className={styles.ccRow} onClick={onClick}>
      <div className={styles.ccHeader}>
        <div className={styles.walletIcon} style={{ background: `${card.color || '#A3296B'}18`, color: card.color || '#A3296B' }}>
          {card.icon || '💳'}
        </div>
        <div>
          <div className={styles.walletName}>{card.name}</div>
          <div className={styles.ccClose}>Cierra día {selectors.closeDayFor(card, currentMonth, currentYear)}</div>
        </div>
      </div>
      <div className={styles.ccPills}>
        <div className={styles.ccPill}>
          <span className={styles.ccPillLabel}>Resumen actual</span>
          <span className={styles.ccPillVal} style={{ color: 'var(--red)' }}>{fmt2(current)}</span>
        </div>
        <div className={styles.ccPill}>
          <span className={styles.ccPillLabel}>Próximo</span>
          <span className={styles.ccPillVal} style={{ color: 'var(--text2)' }}>{fmt2(next)}</span>
        </div>
      </div>
    </div>
  )
}
