import { useState } from 'react'
import { useStore } from '@/store'
import { MONTHS_SHORT } from '@/utils'
import MonthModal from './modals/MonthModal'
import styles from './TopBar.module.css'

export default function TopBar() {
  const { currentMonth, currentYear } = useStore()
  const [monthOpen, setMonthOpen] = useState(false)

  return (
    <>
      <header className={styles.bar}>
        <div className={styles.logo}>
          flu<span>jo</span>
        </div>
        <button className={styles.monthBtn} onClick={() => setMonthOpen(true)}>
          <svg width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          {MONTHS_SHORT[currentMonth]} {currentYear}
        </button>
      </header>

      {monthOpen && <MonthModal onClose={() => setMonthOpen(false)} />}
    </>
  )
}
