import { useSyncExternalStore } from 'react'

// Preferencia guardada: 'light' | 'dark'. Sin valor = seguir al sistema.
// index.html aplica lo mismo antes del primer render para evitar el parpadeo.
const KEY = 'flujo-theme'
const META_COLORS = { light: '#EAEAE6', dark: '#0E1F23' }
const media = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set()
let memoryPref = null // por si localStorage no está disponible

export function getThemePref() {
  try { return localStorage.getItem(KEY) } catch { return memoryPref }
}

function resolveTheme() {
  return getThemePref() ?? (media.matches ? 'dark' : 'light')
}

function applyTheme() {
  const theme = resolveTheme()
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', META_COLORS[theme])
  listeners.forEach(fn => fn())
}

/** @param {'light' | 'dark' | null} pref null vuelve a seguir al sistema */
export function setThemePref(pref) {
  memoryPref = pref
  try {
    if (pref) localStorage.setItem(KEY, pref)
    else localStorage.removeItem(KEY)
  } catch { /* sin storage: el cambio dura hasta recargar */ }
  applyTheme()
}

media.addEventListener('change', () => { if (!getThemePref()) applyTheme() })
applyTheme()

function subscribe(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Tema activo ('light' | 'dark') y si sigue al sistema */
export function useTheme() {
  const theme = useSyncExternalStore(subscribe, () => document.documentElement.dataset.theme)
  const pref  = useSyncExternalStore(subscribe, getThemePref)
  return { theme, followsSystem: !pref }
}
