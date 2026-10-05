import { useState } from 'react'
import { useStore, selectors } from '@/store'
import { Modal, Select, Button } from '@/components/ui'
import { fmt2, today, MONTHS_SHORT } from '@/utils'
import styles from './PayCardModal.module.css'

export default function PayCardModal({ card, onClose }) {
    const { wallets, transactions, payCard, currentMonth: m, currentYear: y } = useStore()
    const [fromWalletId, setFromWalletId] = useState(wallets[0]?.id || '')
    const [saving, setSaving] = useState(false)

    // Current billing period total (what will be paid)
    const total = selectors.cardPeriodTotal(card, transactions, m, y)

    const fromWallet = wallets.find(w => w.id === fromWalletId)
    const fromBal = fromWallet ? selectors.walletBalance(fromWallet, transactions) : 0
    const sufficient = fromBal >= total

    async function handlePay() {
        if (!fromWalletId) return alert('Seleccioná una billetera')
        if (total <= 0) return alert('No hay saldo pendiente para pagar')
        if (!sufficient && !confirm(`El saldo de "${fromWallet?.name}" es insuficiente (${fmt2(fromBal)}). ¿Continuar igual?`)) return
        setSaving(true)
        await payCard({ cardId: card.id, fromWalletId, amount: total, month: m, year: y, date: today() })
        setSaving(false)
        onClose()
    }

    return (
        <Modal title={`Pagar ${card.name}`} onClose={onClose}>
            {/* Summary */}
            <div className={styles.summary}>
                <div className={styles.summaryRow}>
                    <span className={styles.summaryLabel}>Resumen</span>
                    <span className={styles.summaryPeriod}>{MONTHS_SHORT[m]} {y}</span>
                </div>
                <div className={styles.totalAmount}>{fmt2(total)}</div>
                {total <= 0 && (
                    <div className={styles.zeroBadge}>No hay saldo pendiente este mes</div>
                )}
            </div>

            <Select
                label="Pagar desde"
                value={fromWalletId}
                onChange={e => setFromWalletId(e.target.value)}
                hint={fromWallet ? `Saldo disponible: ${fmt2(fromBal)}` : undefined}
            >
                {wallets.map(w => (
                    <option key={w.id} value={w.id}>{w.icon} {w.name}</option>
                ))}
            </Select>

            {!sufficient && total > 0 && (
                <div className={styles.warning}>
                    ⚠️ Saldo insuficiente — te faltarían {fmt2(total - fromBal)}
                </div>
            )}

            <div className={styles.notice}>
                Al confirmar, los consumos del resumen quedan marcados como pagados (siguen en tu historial) y se registra un egreso de <strong>{fmt2(total)}</strong> en la billetera seleccionada.
            </div>

            <div style={{ marginTop: 8 }}>
                <Button
                    variant="primary"
                    size="lg"
                    onClick={handlePay}
                    disabled={saving || total <= 0}
                >
                    {saving ? 'Procesando…' : `Pagar ${fmt2(total)}`}
                </Button>
            </div>
        </Modal>
    )
}