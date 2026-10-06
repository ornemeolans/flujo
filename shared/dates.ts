import type { ISODate } from './types.ts'

/**
 * Fecha local 'YYYY-MM-DD'.
 * No usar toISOString(): devuelve la fecha en UTC y en Argentina (UTC-3),
 * después de las 21 hs, ya es el día siguiente.
 */
export function localISO(d: Date = new Date()): ISODate {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Fecha de hoy en una zona horaria IANA (el servidor corre en UTC) */
export function todayIn(timeZone: string, now: Date = new Date()): ISODate {
  // en-CA formatea como YYYY-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Suma días a una fecha 'YYYY-MM-DD' */
export function addDays(date: ISODate, days: number): ISODate {
  const d = new Date(date + 'T12:00:00')
  d.setDate(d.getDate() + days)
  return localISO(d)
}
