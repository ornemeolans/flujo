export { nanoid } from './nanoid'

// ─── Currency ────────────────────────────────────────────────
export function fmt(n, decimals = 0) {
  return '$' + Math.abs(n ?? 0).toLocaleString('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}
export const fmt2 = n => fmt(n, 2)

// ─── Date ────────────────────────────────────────────────────
export const MONTHS = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
]
export const MONTHS_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

export function today() {
  return new Date().toISOString().slice(0, 10)
}

export function formatDate(dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`
}

// ─── Categories ──────────────────────────────────────────────
export const CATEGORIES = [
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

export function getCat(id) {
  return CATEGORIES.find(c => c.id === id) ?? CATEGORIES[CATEGORIES.length - 1]
}

// ─── Wallet types ────────────────────────────────────────────
export const WALLET_TYPES = [
  { id: 'cash',    icon: '💵', label: 'Efectivo' },
  { id: 'virtual', icon: '📱', label: 'Virtual (Mercado Pago, etc.)' },
  { id: 'bank',    icon: '🏦', label: 'Banco / Caja de ahorro' },
  { id: 'savings', icon: '💰', label: 'Inversión / Plazo fijo' },
  { id: 'other',   icon: '🔷', label: 'Otro' },
]

export const WALLET_ICONS = ['💵','📱','🏦','💳','💰','🪙','💎','🌟','🔷','🎯','🏧','💹','🐷','🦊','🏴','⚡']
export const CARD_ICONS   = ['💳','🔵','⬜','🟡','⚫','🔶','💎','🌟','🔷','🎯','🏧','💹','🟢','🔴','🟣','🟠']

export const PALETTE = [
  '#178C9E','#A3296B','#C2A878','#2BB0C4','#D2559A',
  '#3A6E8F','#7D5BA6','#C7754F','#4F9A7A','#B08D4F',
  '#2E9E8A','#8A1F59','#127684','#7F9496','#9A8F7A',
]