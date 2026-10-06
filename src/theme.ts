import { useSyncExternalStore } from 'react'

// Preferencia guardada: 'light' | 'dark'. Sin valor = seguir al sistema.
// index.html aplica lo mismo antes del primer render para evitar el parpadeo.
export type Theme = 'light' | 'dark'

const KEY = 'flujo-theme'
const META_COLORS: Record<Theme, string> = { light: '#EAEAE6', dark: '#0E1F23' }
const media = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()
let memoryPref: Theme | null = null // por si localStorage no está disponible

export function getThemePref(): Theme | null {
  try { return localStorage.getItem(KEY) as Theme | null } catch { return memoryPref }
}

function resolveTheme(): Theme {
  return getThemePref() ?? (media.matches ? 'dark' : 'light')
}

function applyTheme() {
  const theme = resolveTheme()
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLORS[theme])
  listeners.forEach(fn => fn())
}

/** null vuelve a seguir al sistema */
export function setThemePref(pref: Theme | null) {
  memoryPref = pref
  try {
    if (pref) localStorage.setItem(KEY, pref)
    else localStorage.removeItem(KEY)
  } catch { /* sin storage: el cambio dura hasta recargar */ }
  applyTheme()
}

media.addEventListener('change', () => { if (!getThemePref()) applyTheme() })
applyTheme()

function subscribe(fn: () => void) {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** Tema activo ('light' | 'dark') y si sigue al sistema */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme as Theme)
  const pref  = useSyncExternalStore(subscribe, getThemePref)
  return { theme, followsSystem: !pref }
}
