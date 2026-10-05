// ─── Préstamos ──────────────────────────────────────────────
// Modelo de préstamo personal argentino: cuotas mensuales que se debitan de una
// billetera el día de vencimiento (si cae sábado o domingo, el lunes siguiente).
//
// loan = {
//   id, name, walletId,
//   principal,      monto pedido
//   cuotas,         cantidad total de cuotas
//   paidBefore,     cuotas ya pagadas al cargarlo en la app (no se debitan)
//   firstDue,       'YYYY-MM-DD' vencimiento de la cuota paidBefore + 1
//   mode,           'fixed' (valor de cuota informado por el banco) | 'tna' (calculado)
//   cuotaAmount,    modo fixed: valor de la cuota (si cambia, p. ej. UVA, aplica a las que faltan)
//   tna, iva,       modo tna: sistema francés + 21% de IVA sobre los intereses
//   credited, creditDate   si el monto se acreditó en la billetera
// }

export const IVA_RATE = 0.21

// Fecha local 'YYYY-MM-DD' (toISOString usa UTC y en Argentina después de las 21 ya es mañana)
export function localISO(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Vencimiento de la cuota n (1-based, n > paidBefore)
export function loanDueDate(loan, n) {
  const first = new Date(loan.firstDue + 'T12:00:00')
  const dueDay = first.getDate()
  const offset = n - (loan.paidBefore || 0) - 1
  const y = first.getFullYear() + Math.floor((first.getMonth() + offset) / 12)
  const m = (first.getMonth() + offset) % 12
  const lastDay = new Date(y, m + 1, 0).getDate()
  const d = new Date(y, m, Math.min(dueDay, lastDay), 12)
  // Fin de semana → próximo día hábil
  if (d.getDay() === 6) d.setDate(d.getDate() + 2)
  if (d.getDay() === 0) d.setDate(d.getDate() + 1)
  return localISO(d)
}

// TNA vigente para la cuota n: la inicial o el último cambio con fromCuota <= n
export function tnaForCuota(loan, n) {
  let tna = Number(loan.tna) || 0
  for (const c of sortedRateChanges(loan)) if (c.fromCuota <= n) tna = c.tna
  return tna
}

export function sortedRateChanges(loan) {
  return [...(loan.rateChanges || [])].sort((a, b) => a.fromCuota - b.fromCuota)
}

// Cuota pura del sistema francés para un saldo, tasa mensual y cuotas restantes
function cuotaPura(saldo, i, restantes) {
  if (i === 0) return saldo / restantes
  const f = Math.pow(1 + i, restantes)
  return saldo * i * f / (f - 1)
}

// Desglose de la cuota n en modo TNA (sistema francés). Si la tasa cambia
// (rateChanges: [{ fromCuota, tna }]), desde esa cuota se recalcula la cuota
// pura sobre el saldo pendiente y las cuotas que quedan, como hacen los bancos.
export function frenchCuota(loan, n) {
  const P = Number(loan.principal) || 0
  const N = Number(loan.cuotas) || 0
  if (!P || !N || n < 1 || n > N) return { capital: 0, interes: 0, iva: 0, total: 0, tna: 0 }
  let saldo = P
  let i = tnaForCuota(loan, 1) / 100 / 12
  let pura = cuotaPura(saldo, i, N)
  for (let k = 1; ; k++) {
    const tna = tnaForCuota(loan, k)
    if (k > 1 && tna / 100 / 12 !== i) {
      i = tna / 100 / 12
      pura = cuotaPura(saldo, i, N - k + 1)
    }
    const interes = saldo * i
    if (k === n) {
      const iva = loan.iva ? interes * IVA_RATE : 0
      return { capital: pura - interes, interes, iva, total: round2(pura + iva), tna }
    }
    saldo -= pura - interes
  }
}

export function loanCuotaAmount(loan, n) {
  return loan.mode === 'tna' ? frenchCuota(loan, n).total : round2(Number(loan.cuotaAmount) || 0)
}

export const loanPaymentId = (loanId, n) => `loan-${loanId}-${n}`
export const loanCreditId  = loanId => `loan-${loanId}-in`

// Débitos de cuotas vencidas hasta `todayStr` que todavía no existen.
// `existingIds`: ids de transacciones (incluidas las borradas: si el usuario
// borró un débito, no se vuelve a generar).
export function pendingLoanPayments(loan, existingIds, todayStr = localISO()) {
  const out = []
  for (let n = (loan.paidBefore || 0) + 1; n <= loan.cuotas; n++) {
    const date = loanDueDate(loan, n)
    if (date > todayStr) break
    const id = loanPaymentId(loan.id, n)
    if (existingIds.has(id)) continue
    out.push({
      id, type: 'expense', amount: loanCuotaAmount(loan, n),
      walletId: loan.walletId, category: 'loan', date,
      desc: `Cuota ${n}/${loan.cuotas} · ${loan.name}`,
      cuotas: 1, cuotaActual: 1, createdAt: date,
      loanId: loan.id, loanCuota: n,
    })
  }
  return out
}

// Estado del préstamo a partir de sus débitos registrados
export function loanStatus(loan, transactions) {
  const debited = transactions.filter(t => t.loanId === loan.id && t.loanCuota)
  const paidNums = new Set(debited.map(t => t.loanCuota))
  const paid = (loan.paidBefore || 0) + paidNums.size
  let next = null
  let remaining = 0
  for (let n = (loan.paidBefore || 0) + 1; n <= loan.cuotas; n++) {
    if (paidNums.has(n)) continue
    const amount = loanCuotaAmount(loan, n)
    remaining += amount
    if (!next) next = { n, date: loanDueDate(loan, n), amount }
  }
  return { paid, total: loan.cuotas, next, remaining: round2(remaining), done: !next }
}

function round2(n) { return Math.round(n * 100) / 100 }
