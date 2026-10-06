import { useLocation, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import TopBar from './TopBar'
import BottomNav from './BottomNav'
import TxModal from './modals/TxModal'
import PwaStatus from '@/pwa/PwaStatus'
import styles from './Layout.module.css'

export default function Layout({ children }) {
  const [txModalOpen, setTxModalOpen] = useState(false)

  return (
    <div className={styles.app}>
      <PwaStatus />
      <TopBar onNewTx={() => setTxModalOpen(true)} />

      <main className={styles.main}>
        {children}
      </main>

      {/* FAB */}
      <button className={styles.fab} onClick={() => setTxModalOpen(true)} aria-label="Nueva transacción">
        <svg width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
          <line x1="12" y1="5" x2="12" y2="19"/>
          <line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>

      <BottomNav />

      {txModalOpen && (
        <TxModal onClose={() => setTxModalOpen(false)} />
      )}
    </div>
  )
}
