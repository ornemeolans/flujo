import { localISO } from '@shared/dates'
import type { ISODate } from '@shared/types'

export { nanoid } from './nanoid'
export { localISO }

// ─── Currency ────────────────────────────────────────────────
export function fmt(n: number | null | undefined, decimals = 0): string {
  return '$' + Math.abs(n ?? 0).toLocaleString('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
export const fmt2 = (n: number | null | undefined) => fmt(n, 2)

// ─── Date ────────────────────────────────────────────────────
export const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
]
export const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

/** Hoy en hora local (ver localISO: toISOString usa UTC) */
export function today(): ISODate {
  return localISO()
}

export function formatDate(dateStr: ISODate): string {
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

// ─── Categories ──────────────────────────────────────────────
export interface Category {
  id: string
  icon: string
  label: string
  color: string
}

export const CATEGORIES: Category[] = [
  { id: 'food',          icon: '🍔', label: 'Comida',       color: '#178C9E' },
  { id: 'transport',     icon: '🚗', label: 'Transporte',   color: '#C2A878' },
  { id: 'home',          icon: '🏠', label: 'Hogar',        color: '#A3296B' },
  { id: 'health',        icon: '🏥', label: 'Salud',        color: '#4F9A7A' },
  { id: 'entertainment', icon: '🎬', label: 'Ocio',         color: '#D2559A' },
  { id: 'clothes',       icon: '👕', label: 'Ropa',         color: '#C7754F' },
  { id: 'tech',          icon: '💻', label: 'Tecnología',   color: '#2BB0C4' },
  { id: 'education',     icon: '📚', label: 'Educación',    color: '#3A6E8F' },
  { id: 'travel',        icon: '✈️', label: 'Viajes',       color: '#7D5BA6' },
  { id: 'services',      icon: '💡', label: 'Servicios',    color: '#B08D4F' },
  { id: 'salary',        icon: '💼', label: 'Sueldo',       color: '#178C9E' },
  { id: 'yield',         icon: '📈', label: 'Rendimiento',  color: '#2E9E8A' },
  { id: 'transfer',      icon: '↔️', label: 'Transferencia', color: '#7F9496' },
  { id: 'loan',          icon: '🏛️', label: 'Préstamo',     color: '#8A1F59' },
  { id: 'other',         icon: '📦', label: 'Otro',         color: '#9A8F7A' },
]

export function getCat(id: string): Category {
  return CATEGORIES.find(c => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]
}

// ─── Wallet types ────────────────────────────────────────────
export const WALLET_TYPES: { id: string; icon: string; label: string }[] = [
  { id: 'cash',    icon: '💵', label: 'Efectivo' },
  { id: 'virtual', icon: '📱', label: 'Virtual (Mercado Pago, etc.)' },
  { id: 'bank',    icon: '🏦', label: 'Banco / Caja de ahorro' },
  { id: 'savings', icon: '💰', label: 'Inversión / Plazo fijo' },
  { id: 'other',   icon: '🔷', label: 'Otro' },
]

export const WALLET_ICONS: string[] = ['💵','📱','🏦','💳','💰','🪙','💎','🌟','🔷','🎯','🏧','💹','🐷','🦊','🏴','⚡']
export const CARD_ICONS: string[]   = ['💳','🔵','⬜','🟡','⚫','🔶','💎','🌟','🔷','🎯','🏧','💹','🟢','🔴','🟣','🟠']

export const PALETTE: string[] = [
  '#178C9E','#A3296B','#C2A878','#2BB0C4','#D2559A',
  '#3A6E8F','#7D5BA6','#C7754F','#4F9A7A','#B08D4F',
  '#2E9E8A','#8A1F59','#127684','#7F9496','#9A8F7A',
]