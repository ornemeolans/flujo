// ─── Modo demo ──────────────────────────────────────────────
// Datos de ejemplo para probar la app en segundos (pensado para quien la ve por
// primera vez, p. ej. desde el portfolio). Las fechas son relativas a hoy para
// que siempre se vea "actual". Todos los ids contienen "demo-": así se pueden
// borrar sin tocar datos reales y nunca se suben a una cuenta.
import type { CreditCard, ISODate, Loan, Transaction, Wallet } from '@shared/types'
import { addDays, localISO } from '@shared/dates'

export const isDemoId = (id: string) => /(^|-)demo-/.test(id)

export interface DemoData {
  wallets: Wallet[]
  cards: CreditCard[]
  transactions: Transaction[]
  loans: Loan[]
}

/** Día `day` del mes que está `monthsAgo` meses antes de `today` */
function dayOfMonth(today: ISODate, monthsAgo: number, day: number): ISODate {
  const t = new Date(today + 'T12:00:00')
  const d = new Date(t.getFullYear(), t.getMonth() - monthsAgo, 1, 12)
  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
  d.setDate(Math.min(day, lastDay))
  return localISO(d)
}

export function buildDemoData(today: ISODate = localISO()): DemoData {
  const ago = (days: number) => addDays(today, -days)

  const wallets: Wallet[] = [
    { id: 'demo-banco', name: 'Banco Galicia', type: 'bank', initialBalance: 850000, icon: '🏦', color: '#178C9E', createdAt: ago(75) },
    {
      id: 'demo-mp', name: 'Mercado Pago', type: 'virtual', initialBalance: 420000, icon: '📱', color: '#2BB0C4',
      tnaEnabled: true, tna: 32, tnaHistory: [], tnaChangedAt: ago(60), createdAt: ago(60),
    },
    { id: 'demo-efectivo', name: 'Efectivo', type: 'cash', initialBalance: 45000, icon: '💵', color: '#C2A878', createdAt: ago(75) },
  ]

  const cards: CreditCard[] = [
    { id: 'demo-visa', name: 'Visa Galicia', closeDay: 20, icon: '💳', color: '#A3296B', createdAt: ago(75) },
  ]

  let n = 0
  const tx = (t: Omit<Transaction, 'id' | 'cuotas' | 'cuotaActual' | 'createdAt'> & { cuotas?: number }): Transaction =>
    ({ cuotas: 1, cuotaActual: 1, ...t, id: `demo-tx-${++n}`, createdAt: t.date })

  const monthly: Transaction[] = []
  for (const m of [2, 1, 0]) {
    const payday = dayOfMonth(today, m, 1)
    monthly.push(
      tx({ type: 'income', amount: 1450000, walletId: 'demo-banco', category: 'salary', date: payday, desc: 'Sueldo' }),
      tx({ type: 'expense', amount: 520000, walletId: 'demo-banco', category: 'home', date: dayOfMonth(today, m, 5), desc: 'Alquiler' }),
      tx({ type: 'expense', amount: 68000, walletId: 'demo-banco', category: 'services', date: dayOfMonth(today, m, 8), desc: 'Luz, gas e internet' }),
      tx({ type: 'expense', amount: 300000, walletId: 'demo-banco', category: 'transfer', date: dayOfMonth(today, m, 2), desc: 'Ahorro → salida', isTransfer: true }),
      tx({ type: 'income', amount: 300000, walletId: 'demo-mp', category: 'transfer', date: dayOfMonth(today, m, 2), desc: 'Ahorro → entrada', isTransfer: true }),
    )
  }
  const recent: Transaction[] = [
    tx({ type: 'expense', amount: 84350, walletId: 'demo-visa', category: 'food', date: ago(26), desc: 'Supermercado' }),
    tx({ type: 'expense', amount: 899999, walletId: 'demo-visa', category: 'tech', date: ago(40), desc: 'Notebook', cuotas: 6 }),
    tx({ type: 'expense', amount: 45600, walletId: 'demo-visa', category: 'entertainment', date: ago(12), desc: 'Cine y cena' }),
    tx({ type: 'expense', amount: 132000, walletId: 'demo-visa', category: 'clothes', date: ago(9), desc: 'Zapatillas', cuotas: 3 }),
    tx({ type: 'expense', amount: 61200, walletId: 'demo-visa', category: 'food', date: ago(4), desc: 'Supermercado' }),
    tx({ type: 'expense', amount: 18500, walletId: 'demo-mp', category: 'transport', date: ago(6), desc: 'SUBE' }),
    tx({ type: 'expense', amount: 23900, walletId: 'demo-mp', category: 'food', date: ago(3), desc: 'Delivery' }),
    tx({ type: 'expense', amount: 12000, walletId: 'demo-efectivo', category: 'food', date: ago(2), desc: 'Verdulería' }),
    tx({ type: 'expense', amount: 35000, walletId: 'demo-mp', category: 'health', date: ago(15), desc: 'Farmacia' }),
    tx({ type: 'expense', amount: 9800, walletId: 'demo-efectivo', category: 'transport', date: ago(1), desc: 'Taxi' }),
  ]
  // Fechas futuras se descartan: la demo solo muestra lo que ya pasó
  const transactions = [...monthly, ...recent].filter(t => t.date <= today)

  // Préstamo a mitad de camino: las cuotas vencidas las debita la app sola al cargar
  const firstDue = dayOfMonth(today, 3, 10)
  const loans: Loan[] = [{
    id: 'demo-prestamo', name: 'Préstamo personal Banco Nación', walletId: 'demo-banco',
    principal: 1500000, cuotas: 12, paidBefore: 0, firstDue,
    mode: 'tna', tna: 72, iva: true, cuotaAmount: 0, rateChanges: [],
    credited: true, creditDate: addDays(firstDue, -30), createdAt: addDays(firstDue, -30),
  }]
  transactions.push({
    id: 'loan-demo-prestamo-in', type: 'income', amount: 1500000, walletId: 'demo-banco', category: 'loan',
    date: addDays(firstDue, -30), desc: 'Préstamo personal Banco Nación · acreditación',
    cuotas: 1, cuotaActual: 1, createdAt: addDays(firstDue, -30), loanId: 'demo-prestamo',
  })

  return { wallets, cards, transactions, loans }
}
