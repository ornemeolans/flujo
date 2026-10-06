import { describe, expect, it } from 'vitest'
import type { CreditCard } from '@shared/types'
import { addMonths, closeDateFor, closeDayFor, periodKey } from '@shared/cards'
import { addDays, localISO, todayIn } from '@shared/dates'

describe('fechas', () => {
  it('localISO usa la fecha local, no UTC (22:30 en Argentina sigue siendo el mismo día)', () => {
    const lateNight = new Date(2026, 9, 5, 22, 30) // 5/10 22:30 local = 6/10 01:30 UTC
    expect(lateNight.toISOString().slice(0, 10)).toBe('2026-10-06')
    expect(localISO(lateNight)).toBe('2026-10-05')
  })

  it('todayIn calcula el día en otra zona horaria', () => {
    const utc = new Date('2026-10-06T02:00:00Z')
    expect(todayIn('America/Argentina/Buenos_Aires', utc)).toBe('2026-10-05')
    expect(todayIn('UTC', utc)).toBe('2026-10-06')
  })

  it('addDays cruza meses y años', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

describe('resúmenes de tarjeta', () => {
  const card: CreditCard = { id: 'c', name: 'Visa', closeDay: 31, closeOverrides: { '2026-10': 22 } }

  it('periodKey y addMonths (también hacia atrás y cruzando años)', () => {
    expect(periodKey({ month: 0, year: 2026 })).toBe('2026-01')
    expect(addMonths({ month: 11, year: 2026 }, 1)).toEqual({ month: 0, year: 2027 })
    expect(addMonths({ month: 0, year: 2026 }, -1)).toEqual({ month: 11, year: 2025 })
  })

  it('el cierre puntual de un mes tiene prioridad sobre el habitual', () => {
    expect(closeDayFor(card, 9, 2026)).toBe(22)
    expect(closeDayFor(card, 10, 2026)).toBe(31)
  })

  it('si el día de cierre no existe en el mes, usa el último', () => {
    expect(closeDateFor(card, 1, 2026)).toBe('2026-02-28')
    expect(closeDateFor(card, 9, 2026)).toBe('2026-10-22')
  })
})
