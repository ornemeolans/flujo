import { useState } from 'react'
import { useStore, selectors } from '@/store'
import { Modal, Button } from '@/components/ui'
import { fmt2, MONTHS_SHORT, getCat } from '@/utils'
import styles from './CardDetailModal.module.css'

export default function CardDetailModal({ card, onClose, onEdit, onPay }) {
    const { transactions, cards, setCardCloseOverride } = useStore()
    // La prop puede quedar desactualizada al editar el cierre: leer la versión del store
    card = cards.find(c => c.id === card.id) ?? card
    const now = new Date()
    const [viewMonth, setViewMonth] = useState(now.getMonth())
    const [viewYear, setViewYear] = useState(now.getFullYear())

    const items = selectors.cardPeriodItems(card, transactions, viewMonth, viewYear)
    const total = items.reduce((s, i) => s + i.lineAmount, 0)
    const pending = items.filter(i => !i.paid).reduce((s, i) => s + i.lineAmount, 0)

    // Previous / next period
    function prevPeriod() {
        if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
        else setViewMonth(m => m - 1)
    }
    function nextPeriod() {
        if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
        else setViewMonth(m => m + 1)
    }

    const closeDay = selectors.closeDayFor(card, viewMonth, viewYear)
    const hasOverride = selectors.periodKey({ month: viewMonth, year: viewYear }) in (card.closeOverrides || {})

    function editClose() {
        const v = prompt(`Día de cierre del resumen ${MONTHS_SHORT[viewMonth]} ${viewYear} (vacío = usar el habitual, día ${card.closeDay})`, hasOverride ? closeDay : '')
        if (v === null) return
        if (v.trim() === '') return setCardCloseOverride(card.id, viewMonth, viewYear, null)
        const day = parseInt(v)
        if (!day || day < 1 || day > 31) return alert('Ingresá un día válido (1-31)')
        setCardCloseOverride(card.id, viewMonth, viewYear, day)
    }

    const isCurrentMonth = viewMonth === now.getMonth() && viewYear === now.getFullYear()

    return (
        <Modal title={card.name} onClose={onClose} size="tall">

            {/* Period navigation */}
            <div className={styles.periodNav}>
                <button className={styles.navArrow} onClick={prevPeriod}>‹</button>
                <div className={styles.periodLabel}>
                    Resumen {MONTHS_SHORT[viewMonth]} {viewYear}
                    {isCurrentMonth && <span className={styles.currentBadge}>actual</span>}
                </div>
                <button className={styles.navArrow} onClick={nextPeriod}>›</button>
            </div>

            {/* Closing date of this period */}
            <div className={styles.closeRow}>
                <span>
                    Cierra el {closeDay} {MONTHS_SHORT[viewMonth]}
                    {hasOverride && <span className={styles.closeTag}>ajustado</span>}
                </span>
                <button className={styles.closeEdit} onClick={editClose}>Cambiar cierre</button>
            </div>

            {/* Total */}
            <div className={styles.totalRow}>
                <span className={styles.totalLabel}>Total del resumen</span>
                <span className={styles.totalVal}>{fmt2(total)}</span>
            </div>
            {total > 0 && pending < total && (
                <div className={styles.paidRow}>
                    {pending === 0 ? '✓ Pagado' : `Pagado ${fmt2(total - pending)} · Pendiente ${fmt2(pending)}`}
                </div>
            )}

            {/* Items list */}
            {items.length === 0 ? (
                <div className={styles.empty}>
                    <div className={styles.emptyIcon}>💳</div>
                    <div className={styles.emptyText}>Sin consumos en este resumen</div>
                </div>
            ) : (
                <div className={styles.list}>
                    {items.map((item, i) => {
                        const cat = getCat(item.tx.category)
                        const d = new Date(item.tx.date + 'T12:00:00')
                        return (
                            <div key={item.tx.id + '-' + i} className={`${styles.item} ${item.paid ? styles.itemPaid : ''}`}>
                                <div className={styles.itemIcon} style={{ background: cat.color + '20', color: cat.color }}>
                                    {cat.icon}
                                </div>
                                <div className={styles.itemInfo}>
                                    <div className={styles.itemName}>
                                        {item.tx.desc || cat.label}
                                        {item.cuotaTotal > 1 && (
                                            <span className={styles.cuotaBadge}>
                                                {item.cuotaNum}/{item.cuotaTotal}
                                            </span>
                                        )}
                                        {item.paid && <span className={styles.paidBadge}>pagado</span>}
                                    </div>
                                    <div className={styles.itemMeta}>
                                        {d.getDate()} {MONTHS_SHORT[d.getMonth()]} · {cat.label}
                                        {item.cuotaTotal > 1 && (
                                            <span className={styles.itemMetaTotal}> · Total {fmt2(item.tx.amount)}</span>
                                        )}
                                    </div>
                                </div>
                                <div className={styles.itemAmount}>{fmt2(item.lineAmount)}</div>
                            </div>
                        )
                    })}
                </div>
            )}

            {/* Actions */}
            <div className={styles.actions}>
                <Button variant="ghost" size="sm" onClick={onEdit}>Editar tarjeta</Button>
                {isCurrentMonth && pending > 0 && (
                    <Button variant="primary" size="sm" onClick={onPay}>
                        Pagar {fmt2(pending)}
                    </Button>
                )}
            </div>
        </Modal>
    )
}