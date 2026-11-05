import { create } from 'zustand'
import { getAll, getAllRaw, put, putMany, remove, purgeLocal, STORES } from '@/db'
import { buildDemoData, isDemoId } from '@/demo'
import { nanoid } from '@/utils/nanoid'
import { pendingLoanPayments, loanCreditId } from '@shared/loans'
import { periodKey, closeDayFor, addMonths } from '@shared/cards'
import { localISO, addDays } from '@shared/dates'

const today = () => localISO()

// ─── Rendimientos diarios ────────────────────────────────────
// Cada día con TNA rinde saldo × TNA ÷ 365 y ese interés se suma al saldo.
// Los rendimientos se recalculan siempre a partir de los datos actuales: si se carga,
// edita o borra un movimiento de un día anterior, cambian los de ese día en adelante.
// Ids determinísticos por billetera y día: dos dispositivos con los mismos datos
// generan los mismos registros, y solo se escriben los días que cambiaron.
// Respeta tnaHistory: [{tna, from}]; un cambio de tasa rige desde el día siguiente.
export function tnaForDate(wallet, dateStr) {
  // La tasa actual rige desde tnaChangedAt; antes, la del historial
  if (wallet.tnaChangedAt && dateStr >= wallet.tnaChangedAt) return wallet.tna
  // tnaHistory is sorted ascending by `from`
  const history = wallet.tnaHistory || []
  let rate = wallet.tna // current rate as fallback
  for (const entry of history) {
    if (dateStr >= entry.from) rate = entry.tna
    else break
  }
  return rate
}

// Primer día con rendimiento: el de la tasa más antigua registrada
function yieldStart(wallet) {
  const history = wallet.tnaHistory || []
  if (history.length) return history.reduce((min, h) => (h.from < min ? h.from : min), history[0].from)
  // Si la TNA se activó después de crear la billetera, rinde desde ese día
  return wallet.tnaChangedAt > wallet.createdAt ? wallet.tnaChangedAt : wallet.createdAt
}

const signed = t => (t.type === 'income' ? t.amount : -t.amount)

/** Calcula los cambios que necesitan los rendimientos hasta ayer (hoy todavía no cerró) */
export function planYields(wallets, transactions, todayStr = today()) {
  const writes = []
  const removals = []

  for (const wallet of wallets) {
    if (!wallet.tnaEnabled) continue
    const start = yieldStart(wallet)
    if (!start || start >= todayStr) continue

    const own = transactions.filter(t => t.walletId === wallet.id)
    // Lo anterior al primer día rinde como saldo de partida, sin tocarlo
    let balance = own.filter(t => t.date < start).reduce((sum, t) => sum + signed(t), wallet.initialBalance ?? 0)

    const movesByDay = new Map()
    const yieldByDay = new Map()
    for (const t of own) {
      if (t.date < start || t.date >= todayStr) continue
      if (!t.isYield) movesByDay.set(t.date, (movesByDay.get(t.date) ?? 0) + signed(t))
      else if (yieldByDay.has(t.date)) removals.push(t.id) // duplicado de un mismo día
      else yieldByDay.set(t.date, t)
    }

    for (let day = start; day < todayStr; day = addDays(day, 1)) {
      balance += movesByDay.get(day) ?? 0
      const tna = tnaForDate(wallet, day)
      const amount = tna > 0 && balance > 0 ? Math.round(balance * (tna / 100 / 365) * 100) / 100 : 0
      const current = yieldByDay.get(day)

      if (amount > 0) {
        const desc = `Rendimiento diario (TNA ${tna}%)`
        if (!current || current.amount !== amount || current.desc !== desc) {
          writes.push({
            ...current,
            id: current?.id ?? `yield-${wallet.id}-${day}`,
            type: 'income',
            amount,
            walletId: wallet.id,
            category: 'yield',
            date: day,
            desc,
            cuotas: 1,
            cuotaActual: 1,
            createdAt: current?.createdAt ?? day,
            isYield: true,
          })
        }
        balance += amount
      } else if (current) {
        removals.push(current.id) // con saldo en cero o negativo no rinde
      }
    }
  }
  return { writes, removals }
}

async function syncYields(wallets) {
  const { writes, removals } = planYields(wallets, await getAll(STORES.TRANSACTIONS))
  await putMany(STORES.TRANSACTIONS, writes)
  for (const id of removals) await remove(STORES.TRANSACTIONS, id)
  return writes.length + removals.length
}

// ─── Débito de cuotas de préstamos ───────────────────────────
// Igual que los rendimientos: al abrir la app se registran las cuotas que
// vencieron desde la última vez. Ids determinísticos para que la sync unifique.
async function accrueLoanPayments(loans) {
  if (!loans.length) return
  const existingIds = new Set((await getAllRaw(STORES.TRANSACTIONS)).map(t => t.id))
  await putMany(STORES.TRANSACTIONS, loans.flatMap(l => pendingLoanPayments(l, existingIds)))
}

// ─── Migración a Ahorros ─────────────────────────────────────
// Las cuentas creadas como ahorro antes de que existiera la sección pasan a
// Ahorros al abrir la app. "Caja de ahorro" es una cuenta bancaria común.
// savingsReviewed evita pisar la decisión de quien la devuelva a otro tipo.
const looksLikeSavings = w => /ahorro/i.test(w.name) && !/caja\s+de\s+ahorro/i.test(w.name)

export async function migrateSavings(wallets) {
  const pending = wallets.filter(w => w.type !== 'savings' && !w.savingsReviewed && looksLikeSavings(w))
  if (!pending.length) return wallets
  await putMany(STORES.WALLETS, pending.map(w => ({ ...w, type: 'savings', savingsReviewed: true })))
  return getAll(STORES.WALLETS)
}

export const useStore = create((set, get) => ({
  // ─── Data ───────────────────────────────────
  wallets: [],
  cards: [],
  transactions: [],
  loans: [],
  loading: true,

  // ─── UI State ───────────────────────────────
  currentMonth: new Date().getMonth(),
  currentYear: new Date().getFullYear(),

  // ─── Bootstrap ──────────────────────────────
  async loadAll() {
    const [storedWallets, cards, transactions, loans] = await Promise.all([
      getAll(STORES.WALLETS),
      getAll(STORES.CARDS),
      getAll(STORES.TRANSACTIONS),
      getAll(STORES.LOANS),
    ])
    const wallets = await migrateSavings(storedWallets)
    set({ wallets, cards, transactions, loans, loading: false })

    // Debitar cuotas vencidas antes de calcular rendimientos (afectan el saldo)
    await accrueLoanPayments(loans.filter(l => wallets.some(w => w.id === l.walletId)))

    await syncYields(wallets)
    set({ transactions: await getAll(STORES.TRANSACTIONS) })
  },

  // Re-lee IndexedDB (p. ej. después de recibir cambios de otro dispositivo)
  async refresh() {
    const [wallets, cards, transactions, loans] = await Promise.all([
      getAll(STORES.WALLETS),
      getAll(STORES.CARDS),
      getAll(STORES.TRANSACTIONS),
      getAll(STORES.LOANS),
    ])
    set({ wallets, cards, transactions, loans })
  },

  // ─── Modo demo ──────────────────────────────
  // Carga datos de ejemplo; al cargarse se generan solos los rendimientos y las
  // cuotas vencidas del préstamo, como con datos reales.
  async loadDemo() {
    const demo = buildDemoData()
    await Promise.all([
      putMany(STORES.WALLETS, demo.wallets),
      putMany(STORES.CARDS, demo.cards),
      putMany(STORES.TRANSACTIONS, demo.transactions),
      putMany(STORES.LOANS, demo.loans),
    ])
    await get().loadAll()
  },

  // Borra definitivamente los datos de ejemplo (sin tombstones: nunca se sincronizan)
  async clearDemo() {
    await purgeLocal(isDemoId)
    await get().refresh()
  },

  setMonth(month, year) {
    set({ currentMonth: month, currentYear: year })
  },

  // ─── Wallets ────────────────────────────────
  async saveWallet(data) {
    const d = today()
    let item = data.id ? { ...data, savingsReviewed: true } : { ...data, id: nanoid(), createdAt: d, savingsReviewed: true }

    if (data.id) {
      const prev = get().wallets.find(w => w.id === data.id)
      if (prev) {
        const tnaChanged = prev.tna !== data.tna || prev.tnaEnabled !== data.tnaEnabled
        if (tnaChanged) {
          // Record the old rate in history up to yesterday
          // New rate takes effect from tomorrow (next accrual day)
          const tomorrow = new Date(d + 'T12:00:00')
          tomorrow.setDate(tomorrow.getDate() + 1)
          const tomorrowStr = localISO(tomorrow)

          const history = prev.tnaHistory || []
          // Close previous entry and open new one from tomorrow
          if (prev.tnaEnabled && prev.tna > 0) {
            history.push({ tna: prev.tna, from: prev.tnaChangedAt || prev.createdAt || d })
          }
          item = { ...item, tnaHistory: history, tnaChangedAt: tomorrowStr }
        }
      }
    } else {
      // New wallet: TNA starts from creation date
      item = { ...item, tnaHistory: [], tnaChangedAt: d }
    }

    await put(STORES.WALLETS, item)
    const [wallets, transactions] = await Promise.all([getAll(STORES.WALLETS), getAll(STORES.TRANSACTIONS)])
    set({ wallets, transactions })

    return item
  },

  async deleteWallet(id) {
    await remove(STORES.WALLETS, id)
    // Also remove related transactions
    const txToDelete = get().transactions.filter(t => t.walletId === id)
    await Promise.all(txToDelete.map(t => remove(STORES.TRANSACTIONS, t.id)))
    const [wallets, transactions] = await Promise.all([
      getAll(STORES.WALLETS),
      getAll(STORES.TRANSACTIONS),
    ])
    set({ wallets, transactions })
  },

  // ─── Cards ──────────────────────────────────
  async saveCard(data) {
    const item = data.id ? data : { ...data, id: nanoid(), createdAt: today() }
    await put(STORES.CARDS, item)
    const cards = await getAll(STORES.CARDS)
    set({ cards })
    return item
  },

  // Cierre puntual de un resumen (los bancos lo mueven unos días cada mes).
  // day = null vuelve a usar el día de cierre habitual de la tarjeta.
  async setCardCloseOverride(cardId, month, year, day) {
    const card = get().cards.find(c => c.id === cardId)
    if (!card) return
    const closeOverrides = { ...(card.closeOverrides || {}) }
    const key = selectors.periodKey({ month, year })
    if (day == null) delete closeOverrides[key]
    else closeOverrides[key] = day
    await get().saveCard({ ...card, closeOverrides })
  },

  async deleteCard(id) {
    await remove(STORES.CARDS, id)
    const txToDelete = get().transactions.filter(t => t.walletId === id)
    await Promise.all(txToDelete.map(t => remove(STORES.TRANSACTIONS, t.id)))
    const [cards, transactions] = await Promise.all([
      getAll(STORES.CARDS),
      getAll(STORES.TRANSACTIONS),
    ])
    set({ cards, transactions })
  },

  // ─── Loans ──────────────────────────────────
  // Guarda el préstamo, acredita (o des-acredita) el monto en la billetera y
  // debita las cuotas que ya hayan vencido.
  async saveLoan(data) {
    const item = data.id ? data : { ...data, id: nanoid(), createdAt: today() }
    await put(STORES.LOANS, item)

    const creditId = loanCreditId(item.id)
    if (item.credited && item.principal > 0) {
      await put(STORES.TRANSACTIONS, {
        id: creditId, type: 'income', amount: item.principal,
        walletId: item.walletId, category: 'loan',
        date: item.creditDate, desc: `${item.name} · acreditación`,
        cuotas: 1, cuotaActual: 1, createdAt: item.creditDate,
        loanId: item.id,
      })
    } else {
      await remove(STORES.TRANSACTIONS, creditId)
    }

    await accrueLoanPayments([item])
    const [loans, transactions] = await Promise.all([getAll(STORES.LOANS), getAll(STORES.TRANSACTIONS)])
    set({ loans, transactions })
    return item
  },

  // Los movimientos ya registrados (acreditación y cuotas debitadas) quedan en el historial
  async deleteLoan(id) {
    await remove(STORES.LOANS, id)
    set({ loans: await getAll(STORES.LOANS) })
  },

  // ─── Transactions ───────────────────────────
  async saveTransaction(data) {
    const item = data.id ? data : { ...data, id: nanoid(), createdAt: today(), createdTime: Date.now() }
    await put(STORES.TRANSACTIONS, item)
    // Las dos patas de una transferencia mantienen monto y fecha
    const pair = get().transactions.find(t => t.id === item.transferPairId)
    if (pair) await put(STORES.TRANSACTIONS, { ...pair, amount: item.amount, date: item.date })
    const transactions = await getAll(STORES.TRANSACTIONS)
    set({ transactions })
    return item
  },

  async deleteTransaction(id) {
    const pairId = get().transactions.find(t => t.id === id)?.transferPairId
    await remove(STORES.TRANSACTIONS, id)
    if (pairId) await remove(STORES.TRANSACTIONS, pairId)
    const transactions = await getAll(STORES.TRANSACTIONS)
    set({ transactions })
  },

  // ─── Transfer between wallets ───────────────
  async transfer({ fromId, toId, amount, date, desc }) {
    const d = date || today()
    const note = desc || 'Transferencia'
    const egreso  = { id: nanoid(), createdTime: Date.now(), type: 'expense', amount, walletId: fromId, category: 'transfer', date: d, desc: `${note} → salida`, cuotas: 1, cuotaActual: 1, createdAt: d, isTransfer: true, transferPairId: null }
    const ingreso = { id: nanoid(), createdTime: Date.now(), type: 'income',  amount, walletId: toId,   category: 'transfer', date: d, desc: `${note} → entrada`, cuotas: 1, cuotaActual: 1, createdAt: d, isTransfer: true, transferPairId: null }
    // Link them so they can be identified as a pair
    egreso.transferPairId  = ingreso.id
    ingreso.transferPairId = egreso.id
    await put(STORES.TRANSACTIONS, egreso)
    await put(STORES.TRANSACTIONS, ingreso)
    const transactions = await getAll(STORES.TRANSACTIONS)
    set({ transactions })
  },

  // ─── Pay credit card ────────────────────────
  // Pays the billing period for a given month/year: each line item gets its
  // paidCuotas incremented. Expenses are kept (history + analytics); the
  // payment itself is excluded from monthly totals to avoid double counting.
  // Legacy payments (before v1.1) deleted their expenses, so they still count.
  async payCard({ cardId, fromWalletId, amount, month, year, date }) {
    const d = date || today()
    const { transactions, cards } = get()
    const card = cards.find(c => c.id === cardId)
    if (!card) return

    const items = selectors.cardPeriodItems(card, transactions, month, year).filter(i => !i.paid)
    await putMany(STORES.TRANSACTIONS, items.map(({ tx, cuotaNum }) => ({ ...tx, paidCuotas: cuotaNum })))

    // Register the payment as an expense on the source wallet
    const payment = {
      id: nanoid(), type: 'expense', amount,
      walletId: fromWalletId, category: 'services',
      date: d, desc: `Pago TC ${card.name}`,
      cuotas: 1, cuotaActual: 1, createdAt: d,
      isCardPayment: true,
      keepsCardExpenses: true,
    }
    await put(STORES.TRANSACTIONS, payment)
    const updatedTx = await getAll(STORES.TRANSACTIONS)
    set({ transactions: updatedTx })
  },
}))

// ─── Derived selectors (pure, no async) ─────────────────────
// Recalcula los rendimientos después de cada acción que cambia saldos o tasas,
// también al recibir cambios de otro dispositivo (refresh)
const AFFECT_YIELDS = ['refresh', 'saveWallet', 'deleteWallet', 'saveLoan', 'deleteLoan', 'saveTransaction', 'deleteTransaction', 'transfer', 'payCard']
useStore.setState(state => Object.fromEntries(AFFECT_YIELDS.map(name => [name, async (...args) => {
  const result = await state[name](...args)
  if (await syncYields(useStore.getState().wallets)) useStore.setState({ transactions: await getAll(STORES.TRANSACTIONS) })
  return result
}])))

export const selectors = {
  // Effective balance of a wallet (initial + all its transactions)
  walletBalance(wallet, transactions) {
    return transactions
      .filter(t => t.walletId === wallet.id)
      .reduce(
        (sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount),
        wallet.initialBalance ?? 0
      )
  },

  // El último primero. Dentro del mismo día manda el momento de carga
  // (los movimientos anteriores a createdTime usan su última modificación)
  sortByRecent(transactions) {
    const loadedAt = t => t.createdTime ?? t.updatedAt ?? 0
    return [...transactions].sort((a, b) => b.date.localeCompare(a.date) || loadedAt(b) - loadedAt(a))
  },

  // De mayor a menor saldo; a igual saldo se mantiene el orden original
  sortByBalance(wallets, transactions) {
    return wallets
      .map(wallet => ({ wallet, balance: selectors.walletBalance(wallet, transactions) }))
      .sort((a, b) => b.balance - a.balance)
      .map(({ wallet }) => wallet)
  },

  isSavings(wallet) {
    return wallet.type === 'savings'
  },

  // Saldo disponible: los ahorros no cuentan
  totalBalance(wallets, transactions) {
    return wallets
      .filter(w => !selectors.isSavings(w))
      .reduce((sum, w) => sum + selectors.walletBalance(w, transactions), 0)
  },

  totalSavings(wallets, transactions) {
    return wallets
      .filter(selectors.isSavings)
      .reduce((sum, w) => sum + selectors.walletBalance(w, transactions), 0)
  },

  // Monthly yield for a wallet — sum of actual daily yield transactions this month
  walletMonthlyYield(wallet, transactions) {
    if (!wallet.tnaEnabled || !wallet.tna) return 0
    const now = new Date()
    const m = now.getMonth(), y = now.getFullYear()
    return transactions
      .filter(t => t.walletId === wallet.id && t.isYield)
      .filter(t => {
        const d = new Date(t.date + 'T12:00:00')
        return d.getMonth() === m && d.getFullYear() === y
      })
      .reduce((sum, t) => sum + t.amount, 0)
  },

  totalMonthlyYield(wallets, transactions) {
    return wallets.reduce((sum, w) => sum + selectors.walletMonthlyYield(w, transactions), 0)
  },

  // Lógica de resúmenes compartida con el servidor (shared/cards.ts)
  periodKey,
  closeDayFor,
  addMonths,

  // Determine which billing period a CC expense's FIRST installment falls into
  cardPeriod(card, date) {
    const d = new Date(date + 'T12:00:00')
    const closeDay = selectors.closeDayFor(card, d.getMonth(), d.getFullYear())
    if (d.getDate() <= closeDay) {
      return { month: d.getMonth(), year: d.getFullYear(), closeDay, label: 'resumen actual' }
    }
    const next = selectors.addMonths({ month: d.getMonth(), year: d.getFullYear() }, 1)
    return { ...next, closeDay: selectors.closeDayFor(card, next.month, next.year), label: 'resumen siguiente' }
  },

  // Compare two periods: -1, 0, 1
  cmpPeriod(a, b) {
    if (a.year !== b.year) return a.year < b.year ? -1 : 1
    if (a.month !== b.month) return a.month < b.month ? -1 : 1
    return 0
  },

  // For a given card and billing period (month/year), returns the list of
  // "line items" to show — one per transaction that has a charge in that period.
  // Each item: { tx, cuotaNum, cuotaTotal, lineAmount, paid }
  // Cuota i (0-based) falls in period first + i; it's paid if i < tx.paidCuotas.
  cardPeriodItems(card, transactions, month, year) {
    const target = { month, year }
    const items = []

    transactions
      .filter(t => t.walletId === card.id && t.type === 'expense')
      .forEach(t => {
        const first  = selectors.cardPeriod(card, t.date)
        const cuotas = t.cuotas > 1 ? t.cuotas : 1
        const i = (target.year - first.year) * 12 + (target.month - first.month)
        if (i < 0 || i >= cuotas) return
        items.push({
          tx: t,
          cuotaNum: i + 1,
          cuotaTotal: cuotas,
          lineAmount: t.amount / cuotas,
          paid: i < (t.paidCuotas || 0),
        })
      })

    return items
  },

  // Pending (unpaid) amount of a billing period
  cardPeriodTotal(card, transactions, month, year) {
    return selectors.cardPeriodItems(card, transactions, month, year)
      .filter(item => !item.paid)
      .reduce((sum, item) => sum + item.lineAmount, 0)
  },

  // Transactions for a given month/year
  monthTransactions(transactions, month, year) {
    return transactions.filter(t => {
      const d = new Date(t.date + 'T12:00:00')
      return d.getMonth() === month && d.getFullYear() === year
    })
  },

  // También cubre las cargadas a mano con la categoría Transferencia
  isTransfer(t) {
    return !!t.isTransfer || t.category === 'transfer'
  },

  // Card payments that keep their expenses would count twice in totals.
  // Las transferencias mueven plata entre cuentas: no son ingreso ni egreso.
  countsInTotals(t) {
    return !t.keepsCardExpenses && !selectors.isTransfer(t)
  },

  monthTotals(transactions, month, year) {
    const txs = selectors.monthTransactions(transactions, month, year).filter(selectors.countsInTotals)
    return txs.reduce(
      (acc, t) => {
        if (t.type === 'income') acc.income += t.amount
        else acc.expense += t.amount
        return acc
      },
      { income: 0, expense: 0 }
    )
  },

  expensesByCategory(transactions, month, year) {
    const txs = selectors.monthTransactions(transactions, month, year).filter(t => t.type === 'expense' && selectors.countsInTotals(t))
    const map = {}
    txs.forEach(t => { map[t.category] = (map[t.category] || 0) + t.amount })
    return Object.entries(map)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount)
  },

  // Find payment method name
  paymentLabel(walletId, wallets, cards) {
    return (
      wallets.find(w => w.id === walletId)?.name ||
      cards.find(c => c.id === walletId)?.name ||
      'Desconocido'
    )
  },
}