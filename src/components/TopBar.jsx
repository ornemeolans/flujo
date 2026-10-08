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
          <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" viewBox="0 0 24 24" aria-hidden="true">
            <rect x="3.5" y="5" width="17" height="15.5" rx="3"/>
            <path d="M8 3v4M16 3v4M3.5 10h17"/>
          </svg>
          {MONTHS_SHORT[currentMonth]} {currentYear}
          <span className={styles.chevron} aria-hidden="true">
            <svg width="10" height="10" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
          </span>
        </button>
      </header>

      {monthOpen && <MonthModal onClose={() => setMonthOpen(false)} />}
    </>
  )
}
