import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { getAll, getAllRaw, applyRemote, changesSince, put, remove, wipeLocal } from '@/db'
import { useStore, selectors, tnaForDate, migrateSavings, planYields } from '@/store'
import { buildDemoData, isDemoId } from '@/demo'
import { localISO } from '@shared/dates'
import type { CreditCard, Transaction, Wallet } from '@shared/types'

beforeEach(async () => {
  await wipeLocal()
  await useStore.getState().refresh()
})

describe('rendimientos diarios', () => {
  const wallet: Wallet = { id: 'mp', name: 'MP', type: 'virtual', initialBalance: 1229.05, tnaEnabled: true, tna: 18.9, tnaHistory: [], tnaChangedAt: '2026-11-02', createdAt: '2026-11-02' }
  const move = (id: string, date: string, amount: number): Transaction =>
    ({ id, type: amount > 0 ? 'income' : 'expense', amount: Math.abs(amount), walletId: 'mp', category: 'other', date })
  // Aplica el plan como lo haría la app y devuelve los movimientos resultantes
  const apply = (txs: Transaction[], w: Wallet[], today: string) => {
    const { writes, removals } = planYields(w, txs, today)
    const byId = new Map(txs.map(t => [t.id, t]))
    writes.forEach(t => byId.set(t.id, t))
    removals.forEach(id => byId.delete(id))
    return [...byId.values()]
  }
  const yieldOn = (txs: Transaction[], date: string) => txs.find(t => t.isYield && t.date === date)?.amount

  it('cada día rinde saldo × TNA ÷ 365 y el interés se capitaliza', () => {
    const txs = apply([move('in', '2026-11-02', 100_000)], [wallet], '2026-11-04')
    const day1 = Math.round(101_229.05 * 0.189 / 365 * 100) / 100
    expect(yieldOn(txs, '2026-11-02')).toBe(day1)
    expect(yieldOn(txs, '2026-11-03')).toBe(Math.round((101_229.05 + day1) * 0.189 / 365 * 100) / 100)
    expect(yieldOn(txs, '2026-11-04')).toBeUndefined() // hoy todavía no cerró
  })

  it('si se carga después un retiro de un día anterior, se corrigen los rendimientos', () => {
    // El 2/11 se calculó con todo el ingreso; los retiros del mismo día se cargaron más tarde
    let txs = apply([move('in', '2026-11-02', 322_443.41)], [wallet], '2026-11-03')
    expect(yieldOn(txs, '2026-11-02')).toBeCloseTo(167.6, 1)
    txs = apply([...txs, move('out', '2026-11-02', -124_584.02)], [wallet], '2026-11-03')
    expect(yieldOn(txs, '2026-11-02')).toBeCloseTo(103.09, 2)
  })

  it('no reescribe nada si los datos no cambiaron', () => {
    const txs = apply([move('in', '2026-11-02', 50_000)], [wallet], '2026-11-06')
    expect(planYields([wallet], txs, '2026-11-06')).toEqual({ writes: [], removals: [] })
  })

  it('sin saldo no rinde, y se borra el rendimiento que ya no corresponde', () => {
    let txs = apply([move('in', '2026-11-02', 50_000)], [wallet], '2026-11-04')
    txs = apply([...txs, move('out', '2026-11-02', -51_229.05)], [wallet], '2026-11-04')
    expect(txs.filter(t => t.isYield)).toEqual([])
  })

  it('un cambio de tasa rige desde el día indicado y no antes', () => {
    const changed: Wallet = { ...wallet, tna: 19, tnaChangedAt: '2026-11-04', tnaHistory: [{ tna: 18.9, from: '2026-11-02' }] }
    const txs = apply([move('in', '2026-11-02', 100_000)], [changed], '2026-11-05')
    expect(txs.find(t => t.date === '2026-11-03' && t.isYield)?.desc).toBe('Rendimiento diario (TNA 18.9%)')
    expect(txs.find(t => t.date === '2026-11-04' && t.isYield)?.desc).toBe('Rendimiento diario (TNA 19%)')
  })

  it('en la app, borrar un movimiento recalcula los rendimientos', async () => {
    const yesterday = localISO(new Date(Date.now() - 86_400_000))
    const twoDaysAgo = localISO(new Date(Date.now() - 2 * 86_400_000))
    const w = { ...wallet, id: 'w-app', initialBalance: 0, tnaChangedAt: twoDaysAgo, createdAt: twoDaysAgo }
    const store = useStore.getState()
    await store.saveWallet(w)
    await useStore.getState().saveTransaction({ ...move('', twoDaysAgo, 100_000), id: undefined, walletId: 'w-app' })
    const withMoney = useStore.getState().transactions.filter(t => t.isYield && t.walletId === 'w-app')
    expect(withMoney.map(t => t.date).sort()).toEqual([twoDaysAgo, yesterday])
    const income = useStore.getState().transactions.find(t => !t.isYield && t.walletId === 'w-app')!
    await useStore.getState().deleteTransaction(income.id)
    expect(useStore.getState().transactions.filter(t => t.isYield && t.walletId === 'w-app')).toEqual([])
  })
})

describe('orden de los movimientos', () => {
  const tx = (id: string, date: string, extra: Partial<Transaction> = {}): Transaction =>
    ({ id, type: 'expense', amount: 1, walletId: 'w', category: 'food', date, ...extra })

  it('muestra primero el día más reciente', () => {
    const list = [tx('viejo', '2026-10-01'), tx('nuevo', '2026-11-02'), tx('medio', '2026-10-15')]
    expect(selectors.sortByRecent(list).map(t => t.id)).toEqual(['nuevo', 'medio', 'viejo'])
    expect(list[0].id).toBe('viejo')
  })

  it('dentro del mismo día, el último cargado va primero', () => {
    const list = [tx('primero', '2026-11-02', { createdTime: 100 }), tx('tercero', '2026-11-02', { createdTime: 300 }), tx('segundo', '2026-11-02', { createdTime: 200 })]
    expect(selectors.sortByRecent(list).map(t => t.id)).toEqual(['tercero', 'segundo', 'primero'])
  })

  it('editar un movimiento nuevo no cambia su lugar, y los anteriores usan updatedAt', () => {
    const list = [tx('editado', '2026-11-02', { createdTime: 100, updatedAt: 900 }), tx('nuevo', '2026-11-02', { createdTime: 200, updatedAt: 200 }), tx('antiguo', '2026-11-02', { updatedAt: 50 })]
    expect(selectors.sortByRecent(list).map(t => t.id)).toEqual(['nuevo', 'editado', 'antiguo'])
  })

  it('al guardar un movimiento queda registrado el momento de carga', async () => {
    const saved = await useStore.getState().saveTransaction(tx('', '2026-11-02', { id: undefined as unknown as string }))
    expect(saved.createdTime).toBeTypeOf('number')
  })
})

describe('orden de las billeteras', () => {
  const wallet = (id: string, initialBalance: number): Wallet => ({ id, name: id, type: 'bank', initialBalance })
  const income = (amount: number): Transaction => ({ id: 'i', type: 'income', amount, walletId: 'vacia', category: 'salary', date: '2026-10-01' })

  it('va de mayor a menor saldo, con las deudas al final y sin cambiar la lista original', () => {
    const wallets = [wallet('vacia', 0), wallet('negativa', -500), wallet('llena', 1000), wallet('media', 300)]
    expect(selectors.sortByBalance(wallets, []).map(w => w.id)).toEqual(['llena', 'media', 'vacia', 'negativa'])
    expect(wallets[0].id).toBe('vacia')
  })

  it('se reordena cuando cambia el saldo', () => {
    const wallets = [wallet('llena', 1000), wallet('vacia', 0)]
    expect(selectors.sortByBalance(wallets, [income(5000)]).map(w => w.id)).toEqual(['vacia', 'llena'])
  })

  it('a igual saldo mantiene el orden original', () => {
    const wallets = [wallet('a', 0), wallet('b', 0), wallet('c', 0)]
    expect(selectors.sortByBalance(wallets, []).map(w => w.id)).toEqual(['a', 'b', 'c'])
  })
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

describe('transferencias', () => {
  const leg = (id: string, type: Transaction['type'], walletId: string, extra: Partial<Transaction> = {}): Transaction =>
    ({ id, type, amount: 100, walletId, category: 'transfer', date: '2026-10-05', ...extra })

  it('no cuentan como ingreso ni egreso, pero mueven el saldo de cada cuenta', () => {
    const banco: Wallet = { id: 'banco', name: 'Banco', type: 'bank', initialBalance: 500 }
    const mp: Wallet = { id: 'mp', name: 'MP', type: 'virtual', initialBalance: 0 }
    // Registros viejos: con la marca, o cargados a mano solo con la categoría
    const txs: Transaction[] = [
      leg('a', 'expense', 'banco', { isTransfer: true }),
      leg('b', 'income', 'mp', { isTransfer: true }),
      leg('c', 'expense', 'banco'),
      leg('d', 'income', 'mp'),
      { id: 'e', type: 'expense', amount: 30, walletId: 'banco', category: 'food', date: '2026-10-05' },
    ]
    expect(selectors.monthTotals(txs, 9, 2026)).toEqual({ income: 0, expense: 30 })
    expect(selectors.expensesByCategory(txs, 9, 2026)).toEqual([{ category: 'food', amount: 30 }])
    expect(selectors.walletBalance(banco, txs)).toBe(270)
    expect(selectors.walletBalance(mp, txs)).toBe(200)
  })

  it('editar o borrar una pata actualiza también la otra', async () => {
    const { transfer, saveTransaction, deleteTransaction } = useStore.getState()
    await transfer({ fromId: 'banco', toId: 'mp', amount: 100, date: '2026-10-05' })
    const [one] = useStore.getState().transactions

    await saveTransaction({ ...one, amount: 250, date: '2026-10-06' })
    expect(useStore.getState().transactions.map(t => [t.amount, t.date]))
      .toEqual([[250, '2026-10-06'], [250, '2026-10-06']])

    await deleteTransaction(one.id)
    expect(useStore.getState().transactions).toEqual([])
  })
})

describe('ahorros', () => {
  const w = (id: string, name: string, type: Wallet['type'], extra: Partial<Wallet> = {}): Wallet =>
    ({ id, name, type, initialBalance: 100, ...extra })

  it('se descuentan del disponible y se suman aparte', () => {
    const wallets = [w('banco', 'Banco', 'bank'), w('fondo', 'Fondo', 'savings')]
    expect(selectors.totalBalance(wallets, [])).toBe(100)
    expect(selectors.totalSavings(wallets, [])).toBe(100)
  })

  it('la actualización mueve las cuentas de ahorro y respeta las demás', async () => {
    const wallets = [
      w('a', 'Mis ahorros', 'bank', { tnaEnabled: true, tna: 30 }),
      w('b', 'Caja de ahorro Galicia', 'bank'),
      w('c', 'Ahorro viaje', 'other', { savingsReviewed: true }),
    ]
    for (const wallet of wallets) await put('wallets', wallet)
    const types = Object.fromEntries((await migrateSavings(await getAll('wallets'))).map(x => [x.id, x.type]))
    expect(types).toEqual({ a: 'savings', b: 'bank', c: 'other' })
    expect((await getAll('wallets')).find(x => x.id === 'a')).toMatchObject({ tnaEnabled: true, tna: 30 })
  })

  it('una cuenta de ahorro con TNA genera rendimientos', async () => {
    await put('wallets', w('fondo', 'Fondo', 'savings', { tnaEnabled: true, tna: 36.5, createdAt: '2020-01-01' }))
    await useStore.getState().loadAll()
    expect(useStore.getState().transactions.some(t => t.walletId === 'fondo' && t.isYield)).toBe(true)
  })

  it('un cambio de TNA rige desde su fecha y activarla no genera rendimientos pasados', async () => {
    const wallet = w('t', 'T', 'savings', { tna: 40, tnaChangedAt: '2026-10-10', tnaHistory: [{ tna: 30, from: '2026-01-01' }] })
    expect(tnaForDate(wallet, '2026-10-09')).toBe(30)
    expect(tnaForDate(wallet, '2026-10-10')).toBe(40)

    await put('wallets', w('n', 'N', 'savings', { createdAt: '2020-01-01', savingsReviewed: true }))
    await useStore.getState().refresh()
    const [saved] = useStore.getState().wallets
    await useStore.getState().saveWallet({ ...saved, tnaEnabled: true, tna: 50 })
    expect(useStore.getState().transactions.filter(t => t.isYield)).toEqual([])
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
