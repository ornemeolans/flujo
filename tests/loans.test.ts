import { describe, expect, it } from 'vitest'
import type { Loan } from '@shared/types'
import { frenchCuota, loanDueDate, loanStatus, pendingLoanPayments, loanCuotaAmount, tnaForCuota, lenderDefaults } from '@shared/loans'

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

// Valores tomados del simulador de GOcuotas (préstamo de Finanzas Digitales S.A.S.):
// $61.000, TNA 179%, tasa fija en pesos, IVA dentro de la cuota, 1.er vencimiento domingo 6/12/2026
describe('préstamos con el IVA dentro de la cuota', () => {
  const go = { principal: 61_000, tna: 179, iva: true, ivaMode: 'incluido' as const, rateChanges: [] }

  it('reproduce al centavo las cuotas del simulador para 1 a 4 cuotas', () => {
    expect(frenchCuota({ ...go, cuotas: 1 }, 1).total).toBe(72_009.99)
    expect(frenchCuota({ ...go, cuotas: 2 }, 1).total).toBe(38_985.33)
    expect(frenchCuota({ ...go, cuotas: 4 }, 1).total).toBe(22_697.74)
    const tres = [1, 2, 3].map(n => frenchCuota({ ...go, cuotas: 3 }, n))
    expect(tres.map(c => c.total)).toEqual([28_077.45, 28_077.45, 28_077.45])
    // El capital devuelto suma el monto pedido, y el IVA es el 21% del interés
    expect(tres.reduce((s, c) => s + c.capital, 0)).toBeCloseTo(61_000, 2)
    expect(tres[0].iva).toBeCloseTo(tres[0].interes * 0.21, 6)
  })

  it('con el IVA aparte la cuota pura es fija y la total baja (criterio de los bancos)', () => {
    const banco = [1, 2, 3].map(n => frenchCuota({ ...go, ivaMode: 'aparte', cuotas: 3 }, n).total)
    expect(banco).toEqual([28_590.51, 28_039.8, 27_406.94])
    // Sin modo guardado (préstamos cargados antes) se calcula como siempre
    expect(frenchCuota({ ...go, ivaMode: undefined, cuotas: 3 }, 1).total).toBe(28_590.51)
  })

  it('un cambio de tasa recalcula las cuotas que faltan también con el IVA incluido', () => {
    const changed = { ...go, cuotas: 4, rateChanges: [{ fromCuota: 3, tna: 120 }] }
    const cuotas = [1, 2, 3, 4].map(n => frenchCuota(changed, n))
    expect(cuotas[0].total).toBe(cuotas[1].total)
    expect(cuotas[2].total).toBe(cuotas[3].total)
    expect(cuotas[2].total).toBeLessThan(cuotas[1].total)
    expect(cuotas.reduce((s, c) => s + c.capital, 0)).toBeCloseTo(61_000, 2)
  })

  it('respeta si la entidad corre o no los vencimientos de fin de semana', () => {
    const loan = { firstDue: '2026-12-06', paidBefore: 0 } // domingo
    expect(loanDueDate(loan, 1)).toBe('2026-12-07')
    expect(loanDueDate({ ...loan, weekendShift: true }, 1)).toBe('2026-12-07')
    expect(loanDueDate({ ...loan, weekendShift: false }, 1)).toBe('2026-12-06')
    expect(loanDueDate({ ...loan, weekendShift: false }, 2)).toBe('2027-01-06')
  })

  it('sugiere el criterio según quién da el préstamo', () => {
    expect(lenderDefaults('bank')).toEqual({ ivaMode: 'aparte', weekendShift: true })
    expect(lenderDefaults('fintech')).toEqual({ ivaMode: 'incluido', weekendShift: false })
  })
})
