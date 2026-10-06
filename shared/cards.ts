import type { CreditCard, ISODate, MonthRef } from './types.ts'
import { localISO } from './dates.ts'

/** 'YYYY-MM' (mes 1-12): clave de un resumen */
export function periodKey({ month, year }: MonthRef): string {
  return `${year}-${String(month + 1).padStart(2, '0')}`
}

export function addMonths({ month, year }: MonthRef, n: number): MonthRef {
  const m = month + n
  return { month: ((m % 12) + 12) % 12, year: year + Math.floor(m / 12) }
}

/** Día de cierre efectivo de un resumen: el puntual si se cargó, si no el habitual */
export function closeDayFor(card: CreditCard, month: number, year: number): number {
  return card.closeOverrides?.[periodKey({ month, year })] ?? card.closeDay ?? 15
}

/** Fecha de cierre del resumen de un mes (si el día no existe, el último del mes) */
export function closeDateFor(card: CreditCard, month: number, year: number): ISODate {
  const lastDay = new Date(year, month + 1, 0).getDate()
  return localISO(new Date(year, month, Math.min(closeDayFor(card, month, year), lastDay), 12))
}
