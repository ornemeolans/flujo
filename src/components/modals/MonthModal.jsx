import { useState } from 'react'
import { useStore } from '@/store'
import { MONTHS_SHORT } from '@/utils'
import { Modal, Button } from '@/components/ui'
import styles from './MonthModal.module.css'

export default function MonthModal({ onClose }) {
  const { currentMonth, currentYear, setMonth } = useStore()
  const [year, setYear] = useState(currentYear)

  function select(month) {
    setMonth(month, year)
    onClose()
  }

  return (
    <Modal title="Seleccionar Período" onClose={onClose}>
      <div className={styles.yearNav}>
        <button className={styles.yearBtn} onClick={() => setYear(y => y - 1)}>‹</button>
        <span className={styles.yearVal}>{year}</span>
        <button className={styles.yearBtn} onClick={() => setYear(y => y + 1)}>›</button>
      </div>

      <div className={styles.grid}>
        {MONTHS_SHORT.map((m, i) => (
          <div
            key={i}
            className={`${styles.item} ${i === currentMonth && year === currentYear ? styles.itemSelected : ''}`}
            onClick={() => select(i)}
          >
            {m}
          </div>
        ))}
      </div>
    </Modal>
  )
}
