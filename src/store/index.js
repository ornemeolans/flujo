import { create } from 'zustand'
import { getAll, getAllRaw, put, putMany, remove, STORES } from '@/db'
import { nanoid } from '@/utils/nanoid'
import { pendingLoanPayments, loanCreditId } from '@/loans'

const today = () => new Date().toISOString().slice(0, 10)

// ─── Daily yield accrual ─────────────────────────────────────
// Called on app load. Generates one yield transaction per missing day.
// Respects tnaHistory: [{tna, from}] so rate changes only apply from next day.
// Never deletes past yields — only adds missing ones going forward.

function tnaForDate(wallet, dateStr) {
  // tnaHistory is sorted ascending by `from`
  const history = wallet.tnaHistory || []
  let rate = wallet.tna // current rate as fallback
  for (const entry of history) {
    if (dateStr >= entry.from) rate = entry.tna
    else break
  }
  return rate
}

async function accrueYields(wallets, transactions) {
  const todayStr = today()

  for (const wallet of wallets) {
    if (!wallet.tnaEnabled) continue

    // Find the last yield date for this wallet
    const yieldTxs = transactions
      .filter(t => t.walletId === wallet.id && t.isYield)
      .sort((a, b) => a.date > b.date ? 1 : -1)

    // Start from: day after last yield, or wallet creation date
    let startDate = wallet.createdAt
      ? new Date(wallet.createdAt + 'T12:00:00')
      : new Date(todayStr + 'T12:00:00')

    if (yieldTxs.length > 0) {
      const last = new Date(yieldTxs[yieldTxs.length - 1].date + 'T12:00:00')
      last.setDate(last.getDate() + 1)
      startDate = last
    }

    const end = new Date(todayStr + 'T12:00:00')
    if (startDate > end) continue

    const allWalletTx = transactions
      .filter(t => t.walletId === wallet.id && !t.isYield)
      .sort((a, b) => a.date > b.date ? 1 : -1)

    // Compute running balance just before startDate
    const startStr = startDate.toISOString().slice(0, 10)
    let runningBal = wallet.initialBalance ?? 0
    for (const t of allWalletTx) {
      if (t.date >= startStr) break
      runningBal += t.type === 'income' ? t.amount : -t.amount
    }
    for (const t of yieldTxs) {
      if (t.date >= startStr) break
      runningBal += t.amount
    }

    const cursor = new Date(startDate)
    const newYields = []

    while (cursor < end) {
      const dateStr = cursor.toISOString().slice(0, 10)

      // Apply non-yield transactions on this day
      for (const t of allWalletTx) {
        if (t.date === dateStr) {
          runningBal += t.type === 'income' ? t.amount : -t.amount
        }
      }

      // Get the TNA that was active on this specific day
      const tna = tnaForDate(wallet, dateStr)
      if (tna > 0 && runningBal > 0) {
        const dailyRate = tna / 100 / 365
        const yieldAmount = runningBal * dailyRate
        if (yieldAmount >= 0.001) {
          const tx = {
            // id determinístico: si dos dispositivos generan el mismo día, la sync los unifica
            id: `yield-${wallet.id}-${dateStr}`,
            type: 'income',
            amount: Math.round(yieldAmount * 100) / 100,
            walletId: wallet.id,
            category: 'yield',
            date: dateStr,
            desc: `Rendimiento diario (TNA ${tna}%)`,
            cuotas: 1,
            cuotaActual: 1,
            createdAt: dateStr,
            isYield: true,
          }
          newYields.push(tx)
          runningBal += tx.amount
        }
      }

      cursor.setDate(cursor.getDate() + 1)
    }

    await putMany(STORES.TRANSACTIONS, newYields)
  }
}

// ─── Débito de cuotas de préstamos ───────────────────────────
// Igual que los rendimientos: al abrir la app se registran las cuotas que
// vencieron desde la última vez. Ids determinísticos para que la sync unifique.
async function accrueLoanPayments(loans) {
  if (!loans.length) return
  const existingIds = new Set((await getAllRaw(STORES.TRANSACTIONS)).map(t => t.id))
  await putMany(STORES.TRANSACTIONS, loans.flatMap(l => pendingLoanPayments(l, existingIds)))
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
    const [wallets, cards, transactions, loans] = await Promise.all([
      getAll(STORES.WALLETS),
      getAll(STORES.CARDS),
      getAll(STORES.TRANSACTIONS),
      getAll(STORES.LOANS),
    ])
    set({ wallets, cards, transactions, loans, loading: false })

    // Debitar cuotas vencidas antes de calcular rendimientos (afectan el saldo)
    await accrueLoanPayments(loans.filter(l => wallets.some(w => w.id === l.walletId)))

    // Accrue daily yields for wallets with TNA
    await accrueYields(wallets, await getAll(STORES.TRANSACTIONS))
    const updatedTx = await getAll(STORES.TRANSACTIONS)
    set({ transactions: updatedTx })
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

  setMonth(month, year) {
    set({ currentMonth: month, currentYear: year })
  },

  // ─── Wallets ────────────────────────────────
  async saveWallet(data) {
    const d = today()
    let item = data.id ? { ...data } : { ...data, id: nanoid(), createdAt: d }

    if (data.id) {
      const prev = get().wallets.find(w => w.id === data.id)
      if (prev) {
        const tnaChanged = prev.tna !== data.tna || prev.tnaEnabled !== data.tnaEnabled
        if (tnaChanged) {
          // Record the old rate in history up to yesterday
          // New rate takes effect from tomorrow (next accrual day)
          const tomorrow = new Date(d + 'T12:00:00')
          tomorrow.setDate(tomorrow.getDate() + 1)
          const tomorrowStr = tomorrow.toISOString().slice(0, 10)

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

    // Accrue any missing yields with the correct rate per day
    if (item.tnaEnabled && item.tna > 0) {
      await accrueYields([item], await getAll(STORES.TRANSACTIONS))
      set({ transactions: await getAll(STORES.TRANSACTIONS) })
    }

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
    const item = data.id ? data : { ...data, id: nanoid(), createdAt: today() }
    await put(STORES.TRANSACTIONS, item)
    const transactions = await getAll(STORES.TRANSACTIONS)
    set({ transactions })
    return item
  },

  async deleteTransaction(id) {
    await remove(STORES.TRANSACTIONS, id)
    const transactions = await getAll(STORES.TRANSACTIONS)
    set({ transactions })
  },

  // ─── Transfer between wallets ───────────────
  async transfer({ fromId, toId, amount, date, desc }) {
    const d = date || today()
    const note = desc || 'Transferencia'
    const egreso  = { id: nanoid(), type: 'expense', amount, walletId: fromId, category: 'transfer', date: d, desc: `${note} → salida`, cuotas: 1, cuotaActual: 1, createdAt: d, isTransfer: true, transferPairId: null }
    const ingreso = { id: nanoid(), type: 'income',  amount, walletId: toId,   category: 'transfer', date: d, desc: `${note} → entrada`, cuotas: 1, cuotaActual: 1, createdAt: d, isTransfer: true, transferPairId: null }
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

  totalBalance(wallets, transactions) {
    return wallets.reduce((sum, w) => sum + selectors.walletBalance(w, transactions), 0)
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

  // 'YYYY-MM' (mes 1-12) — clave de un resumen
  periodKey({ month, year }) {
    return `${year}-${String(month + 1).padStart(2, '0')}`
  },

  // Día de cierre efectivo de un resumen: el puntual si se cargó, si no el habitual
  closeDayFor(card, month, year) {
    return card.closeOverrides?.[selectors.periodKey({ month, year })] ?? card.closeDay ?? 15
  },

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

  // Add N months to a {month, year} object
  addMonths({ month, year }, n) {
    let m = month + n
    let y = year + Math.floor(m / 12)
    m = m % 12
    return { month: m, year: y }
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

  // Card payments that keep their expenses would count twice in totals
  countsInTotals(t) {
    return !t.keepsCardExpenses
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