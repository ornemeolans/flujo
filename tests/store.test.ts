import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getAll, getAllRaw, applyRemote, changesSince, put, remove, wipeLocal } from '@/db'
import { useStore, selectors } from '@/store'
import { buildDemoData, isDemoId } from '@/demo'
import { localISO } from '@shared/dates'
import type { CreditCard, Transaction } from '@shared/types'

beforeEach(async () => {
  await wipeLocal()
  await useStore.getState().refresh()
})

describe('selectores de tarjeta', () => {
  const card: CreditCard = { id: 'visa', name: 'Visa', closeDay: 20 }
  const tx = (date: string, amount: number, cuotas = 1, paidCuotas = 0): Transaction =>
    ({ id: date + amount, type: 'expense', amount, walletId: 'visa', category: 'food', date, cuotas, paidCuotas })

  it('un consumo después del cierre va al resumen siguiente', () => {
    expect(selectors.cardPeriod(card, '2026-10-20')).toMatchObject({ month: 9, label: 'resumen actual' })
    expect(selectors.cardPeriod(card, '2026-10-21')).toMatchObject({ month: 10, label: 'resumen siguiente' })
  })

  it('reparte las cuotas en resúmenes consecutivos y descuenta las pagadas', () => {
    const txs = [tx('2026-10-05', 90_000, 3, 1), tx('2026-10-25', 10_000)]
    expect(selectors.cardPeriodTotal(card, txs, 9, 2026)).toBe(0) // cuota 1 ya pagada
    expect(selectors.cardPeriodTotal(card, txs, 10, 2026)).toBe(30_000 + 10_000)
    expect(selectors.cardPeriodTotal(card, txs, 11, 2026)).toBe(30_000)
    expect(selectors.cardPeriodTotal(card, txs, 0, 2027)).toBe(0)
  })

  it('el pago de la tarjeta no se cuenta dos veces en los totales del mes', () => {
    const txs: Transaction[] = [
      tx('2026-10-05', 50_000),
      { id: 'pago', type: 'expense', amount: 50_000, walletId: 'banco', category: 'services', date: '2026-10-06', keepsCardExpenses: true },
    ]
    expect(selectors.monthTotals(txs, 9, 2026).expense).toBe(50_000)
  })
})

describe('sincronización (IndexedDB)', () => {
  it('gana la escritura más reciente y los borrados se propagan', async () => {
    await put('wallets', { id: 'w', name: 'Local', type: 'cash', initialBalance: 0 })
    const [local] = await getAllRaw('wallets')

    // Un cambio remoto más viejo no pisa al local
    expect(await applyRemote([{ store: 'wallets', record: { ...local, name: 'Viejo', updatedAt: local.updatedAt - 1 } }])).toBe(0)
    // Uno más nuevo sí
    expect(await applyRemote([{ store: 'wallets', record: { ...local, name: 'Remoto', updatedAt: local.updatedAt + 1 } }])).toBe(1)
    expect((await getAll('wallets'))[0].name).toBe('Remoto')

    // El borrado deja un tombstone que se envía en la próxima sync
    await new Promise(r => setTimeout(r, 2))
    const before = Date.now() - 1
    await remove('wallets', 'w')
    expect(await getAll('wallets')).toEqual([])
    const changes = await changesSince(before)
    expect(changes).toHaveLength(1)
    expect(changes[0].record.deletedAt).toBeTruthy()
  })
})

describe('modo demo', () => {
  it('no tiene fechas futuras y todos los ids son de demo', () => {
    const today = '2026-10-05'
    const demo = buildDemoData(today)
    const all = [...demo.wallets, ...demo.cards, ...demo.transactions, ...demo.loans]
    expect(all.every(r => isDemoId(r.id))).toBe(true)
    expect(demo.transactions.every(t => t.date <= today)).toBe(true)
    expect(isDemoId('3f2a9c1e-uuid-real')).toBe(false)
  })

  it('al cargarse debita las cuotas vencidas y genera rendimientos; se borra sin dejar rastros', async () => {
    const { loadDemo, clearDemo } = useStore.getState()
    await loadDemo()
    const { transactions, loans } = useStore.getState()
    const today = localISO()
    expect(loans).toHaveLength(1)
    expect(transactions.filter(t => t.loanCuota).length).toBeGreaterThanOrEqual(2)
    expect(transactions.some(t => t.isYield)).toBe(true)
    expect(transactions.every(t => t.date <= today)).toBe(true)

    await clearDemo()
    const raw = await Promise.all((['wallets', 'cards', 'transactions', 'loans'] as const).map(s => getAllRaw(s)))
    expect(raw.flat()).toEqual([]) // sin tombstones: nada que sincronizar
  })
})
