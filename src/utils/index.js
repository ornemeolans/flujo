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
  { id: 'food',          icon: '🍔', label: 'Comida',       color: '#94DFBD' },
  { id: 'transport',     icon: '🚗', label: 'Transporte',   color: '#709AA8' },
  { id: 'home',          icon: '🏠', label: 'Hogar',        color: '#8F57B3' },
  { id: 'health',        icon: '🏥', label: 'Salud',        color: '#94DFBD' },
  { id: 'entertainment', icon: '🎬', label: 'Ocio',         color: '#8F57B3' },
  { id: 'clothes',       icon: '👕', label: 'Ropa',         color: '#709AA8' },
  { id: 'tech',          icon: '💻', label: 'Tecnología',   color: '#94DFBD' },
  { id: 'education',     icon: '📚', label: 'Educación',    color: '#3B5275' },
  { id: 'travel',        icon: '✈️', label: 'Viajes',       color: '#8F57B3' },
  { id: 'services',      icon: '💡', label: 'Servicios',    color: '#709AA8' },
  { id: 'salary',        icon: '💼', label: 'Sueldo',       color: '#94DFBD' },
  { id: 'yield',         icon: '📈', label: 'Rendimiento',  color: '#94DFBD' },
  { id: 'transfer',      icon: '↔️', label: 'Transferencia', color: '#709AA8' },
  { id: 'other',         icon: '📦', label: 'Otro',         color: '#3B5275' },
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
  '#94DFBD','#8F57B3','#709AA8','#3B5275','#17222D',
  '#6ecfa5','#7a46a0','#5a8898','#2a4060','#b87fd4',
  '#e06b8a','#f0c070','#4a9aba','#c49fe0','#60b090',
]