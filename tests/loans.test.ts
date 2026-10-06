import { describe, expect, it } from 'vitest'
import type { Loan } from '@shared/types'
import { frenchCuota, loanDueDate, loanStatus, pendingLoanPayments, loanCuotaAmount, tnaForCuota } from '@shared/loans'

const base: Loan = {
  id: 'x', name: 'Banco', walletId: 'w', principal: 1_000_000, cuotas: 12, paidBefore: 0,
  firstDue: '2026-01-31', mode: 'tna', tna: 80, iva: true, cuotaAmount: 0, credited: false,
}

describe('vencimientos', () => {
  it('mueve al lunes los que caen sábado o domingo', () => {
    // 28/2/2026 es sábado → lunes 2/3
    expect(loanDueDate(base, 2)).toBe('2026-03-02')
    // 10/1/2027 es domingo → lunes 11/1
    expect(loanDueDate({ firstDue: '2026-10-10', paidBefore: 0 }, 4)).toBe('2027-01-11')
  })

  it('usa el último día del mes si el día no existe (31 → 30/28)', () => {
    expect(loanDueDate(base, 4)).toBe('2026-04-30')
  })

  it('cuenta desde la próxima cuota cuando ya había cuotas pagadas', () => {
    const loan = { ...base, paidBefore: 3, firstDue: '2026-11-10' }
    expect(loanDueDate(loan, 4)).toBe('2026-11-10')
    expect(loanDueDate(loan, 5)).toBe('2026-12-10')
  })
})

describe('sistema francés con IVA', () => {
  const cuotas = Array.from({ length: 12 }, (_, i) => frenchCuota(base, i + 1))

  it('amortiza exactamente el capital', () => {
    const capital = cuotas.reduce((s, c) => s + c.capital, 0)
    expect(capital).toBeCloseTo(1_000_000, 2)
  })

  it('el IVA es el 21% del interés y baja cuota a cuota', () => {
    expect(cuotas[0].interes).toBeCloseTo(1_000_000 * 0.8 / 12, 2)
    for (const c of cuotas) expect(c.iva).toBeCloseTo(c.interes * 0.21, 6)
    for (let i = 1; i < 12; i++) expect(cuotas[i].total).toBeLessThan(cuotas[i - 1].total)
  })

  it('sin IVA la cuota es constante', () => {
    const sinIva = { ...base, iva: false }
    expect(frenchCuota(sinIva, 1).total).toBeCloseTo(frenchCuota(sinIva, 12).total, 1)
  })

  it('tasa 0: cuotas iguales de capital', () => {
    expect(frenchCuota({ ...base, tna: 0 }, 5).total).toBeCloseTo(1_000_000 / 12, 2)
  })
})

describe('cambios de tasa', () => {
  const changed = { ...base, rateChanges: [{ fromCuota: 5, tna: 100 }] }

  it('no altera las cuotas anteriores al cambio', () => {
    for (let n = 1; n <= 4; n++) expect(frenchCuota(changed, n).total).toBe(frenchCuota(base, n).total)
  })

  it('recalcula sobre el saldo pendiente y sigue amortizando todo el capital', () => {
    expect(frenchCuota(changed, 5).total).toBeGreaterThan(frenchCuota(base, 5).total)
    const capital = Array.from({ length: 12 }, (_, i) => frenchCuota(changed, i + 1).capital).reduce((a, b) => a + b)
    expect(capital).toBeCloseTo(1_000_000, 2)
    expect(tnaForCuota(changed, 4)).toBe(80)
    expect(tnaForCuota(changed, 9)).toBe(100)
  })
})

describe('débitos automáticos', () => {
  const fixed: Loan = { ...base, mode: 'fixed', cuotaAmount: 50_000, firstDue: '2026-08-10' }

  it('genera solo las cuotas vencidas y respeta las ya existentes o borradas', () => {
    const txs = pendingLoanPayments(fixed, new Set(['loan-x-2']), '2026-10-05')
    expect(txs.map(t => [t.loanCuota, t.date, t.amount])).toEqual([[1, '2026-08-10', 50_000]])
    expect(txs[0]).toMatchObject({ id: 'loan-x-1', type: 'expense', walletId: 'w', category: 'loan' })
  })

  it('calcula estado, próxima cuota y saldo restante', () => {
    const debited = pendingLoanPayments(fixed, new Set(), '2026-10-05')
    const status = loanStatus(fixed, debited)
    expect(status.paid).toBe(2)
    // 10/10/2026 es sábado → lunes 12 (los feriados no se contemplan)
    expect(status.next).toEqual({ n: 3, date: '2026-10-12', amount: 50_000 })
    expect(status.remaining).toBe(10 * 50_000)
    expect(loanCuotaAmount(fixed, 7)).toBe(50_000)
  })
})
