import { getCat, formatDate, fmt } from '@/utils'
import { selectors } from '@/store'
import { pressable } from '@/components/ui'
import styles from './TxItem.module.css'

export default function TxItem({ tx, wallets, cards, onClick }) {
  const cat = getCat(tx.category)
  const paymentName = selectors.paymentLabel(tx.walletId, wallets, cards)

  return (
    <div className={styles.row} {...pressable(onClick && (() => onClick(tx)))}>
      <div className={styles.icon} style={{ background: `${cat.color}18` }}>
        {cat.icon}
      </div>
      <div className={styles.info}>
        <div className={styles.name}>{tx.desc || cat.label}</div>
        <div className={styles.meta}>
          <span>{formatDate(tx.date)}</span>
          <span className={styles.dot}>·</span>
          <span>{paymentName}</span>
          {tx.cuotas > 1 && (
            <span className={styles.cuotaBadge}>{tx.cuotaActual}/{tx.cuotas}</span>
          )}
        </div>
      </div>
      <div className={`${styles.amount} ${tx.type === 'income' ? styles.inc : styles.exp}`}>
        {tx.type === 'income' ? '+' : '-'}{fmt(tx.amount)}
      </div>
    </div>
  )
}
