import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore, selectors } from '@/store'
import { fmt2, fmt, MONTHS_SHORT } from '@/utils'
import { Section, Card, Empty, Button, pressable } from '@/components/ui'
import { useAuth } from '@/store/auth'
import { isDemoId } from '@/demo'
import TxItem from '@/components/TxItem'
import WalletModal from '@/components/modals/WalletModal'
import CardModal from '@/components/modals/CardModal'
import TxModal from '@/components/modals/TxModal'
import styles from './Home.module.css'

export default function Home() {
  const navigate = useNavigate()
  const { wallets, cards, transactions, loans, currentMonth, currentYear, loadDemo, clearDemo } = useStore()
  const signedIn = useAuth(s => !!s.user)
  const isEmpty = !wallets.length && !cards.length && !transactions.length && !loans.length
  const demoActive = wallets.some(w => isDemoId(w.id))
  const [loadingDemo, setLoadingDemo] = useState(false)

  async function handleDemo() {
    setLoadingDemo(true)
    await loadDemo()
    setLoadingDemo(false)
  }
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
      {demoActive && (
        <div className={styles.demoBanner} role="status">
          <span>Estás viendo <strong>datos de ejemplo</strong></span>
          <button type="button" className={styles.demoClear} onClick={clearDemo}>Borrar y empezar</button>
        </div>
      )}

      {isEmpty && !signedIn && (
        <Card className={styles.welcome}>
          <h1 className={styles.welcomeTitle}>Tus finanzas, <span>claras</span></h1>
          <p className={styles.welcomeText}>
            Billeteras con rendimiento, tarjetas en cuotas y préstamos con débito automático.
            Todo queda en tu dispositivo y funciona sin conexión.
          </p>
          <Button variant="primary" size="lg" onClick={handleDemo} disabled={loadingDemo}>
            {loadingDemo ? 'Cargando…' : 'Probar con datos de ejemplo'}
          </Button>
          <p className={styles.welcomeHint}>O empezá de cero agregando una billetera.</p>
        </Card>
      )}

      {/* Summary hero: doble bisel (bandeja + placa) */}
      <div className={styles.heroShell}>
        <div className={styles.hero}>
          <div className={styles.heroLabel}>
            <span className={styles.heroDot} aria-hidden="true" />
            Saldo total · {MONTHS_SHORT[currentMonth]} {currentYear}
          </div>
          <div className={`${styles.heroAmount} ${totalBalance < 0 ? styles.neg : styles.pos}`}>
            <Money value={totalBalance} />
          </div>
          {totalYield > 0 && (
            <div className={styles.heroYield}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 16l6-6 4 4 6-7M14 7h6v6"/></svg>
              Rinde +{fmt2(totalYield)} este mes
            </div>
          )}
          <div className={styles.flows}>
            <div className={styles.flow}>
              <span className={`${styles.flowIcon} ${styles.flowInc}`} aria-hidden="true">↑</span>
              <span className={styles.flowLabel}>Ingresos</span>
              <span className={`${styles.flowVal} ${styles.pillInc}`}>{fmt2(income)}</span>
            </div>
            <div className={styles.flow}>
              <span className={`${styles.flowIcon} ${styles.flowExp}`} aria-hidden="true">↓</span>
              <span className={styles.flowLabel}>Egresos</span>
              <span className={`${styles.flowVal} ${styles.pillExp}`}>{fmt2(expense)}</span>
            </div>
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
          : (
            <div className={styles.list}>
              {wallets.slice(0, 3).map(w => (
                <WalletRow
                  key={w.id}
                  wallet={w}
                  transactions={transactions}
                  onClick={() => setEditWallet(w)}
                />
              ))}
            </div>
          )
        }
      </Section>

      {/* Credit Cards */}
      <Section
        title="Tarjetas de crédito"
        action="Ver todo →"
        onAction={() => navigate('/wallets')}
      >
        {cards.length === 0
          ? <Empty icon="💳" text="Sin tarjetas" action="+ Agregar" onAction={() => setEditCard({})} />
          : (
            <div className={styles.list}>
              {cards.slice(0, 2).map(card => (
                <CCRow
                  key={card.id}
                  card={card}
                  transactions={transactions}
                  currentMonth={currentMonth}
                  currentYear={currentYear}
                  onClick={() => setEditCard(card)}
                />
              ))}
            </div>
          )
        }
      </Section>

      {/* Recent transactions */}
      <Section
        title="Últimos movimientos"
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
// Importe con los centavos más chicos: se lee primero la parte entera
function Money({ value }) {
  const text = fmt2(value)
  const i = text.lastIndexOf(',')
  if (i < 0) return text
  return <>{text.slice(0, i)}<span className={styles.cents}>{text.slice(i)}</span></>
}

function WalletRow({ wallet, transactions, onClick }) {
  const bal    = selectors.walletBalance(wallet, transactions)
  const yield_ = selectors.walletMonthlyYield(wallet, transactions)
  return (
    <div className={styles.walletRow} {...pressable(onClick)}>
      <div className={styles.walletIcon} style={{ '--tint': wallet.color || '#178C9E' }} aria-hidden="true">
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
    <div className={styles.ccRow} {...pressable(onClick)}>
      <div className={styles.ccHeader}>
        <div className={styles.walletIcon} style={{ '--tint': card.color || '#A3296B' }} aria-hidden="true">
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
          <span className={`${styles.ccPillVal} ${styles.pillExp}`}>{fmt2(current)}</span>
        </div>
        <div className={styles.ccPill}>
          <span className={styles.ccPillLabel}>Próximo</span>
          <span className={`${styles.ccPillVal} ${styles.muted}`}>{fmt2(next)}</span>
        </div>
      </div>
    </div>
  )
}
