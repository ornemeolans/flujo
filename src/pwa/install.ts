import { useSyncExternalStore } from 'react'

// Chrome/Edge/Android disparan `beforeinstallprompt` una sola vez y temprano:
// se captura al cargar el módulo (importado desde main) para mostrar después
// un botón propio de "Instalar app" en lugar del menú del navegador.
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let deferred: BeforeInstallPromptEvent | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(fn => fn())

const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true

let installed = isStandalone()

window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault()
  deferred = e as BeforeInstallPromptEvent
  emit()
})
window.addEventListener('appinstalled', () => {
  deferred = null
  installed = true
  emit()
})

export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  await deferred.prompt()
  const { outcome } = await deferred.userChoice
  deferred = null
  emit()
  return outcome === 'accepted'
}

// iOS no tiene beforeinstallprompt: se instala desde Compartir → Agregar a inicio
const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)

export interface InstallState {
  /** Ya corre como app instalada */
  installed: boolean
  /** Se puede mostrar el diálogo nativo de instalación */
  canPrompt: boolean
  /** iOS: hay que explicar cómo instalarla a mano */
  iosHint: boolean
}

let snapshot: InstallState = compute()
function compute(): InstallState {
  return { installed, canPrompt: !!deferred && !installed, iosHint: isIOS && !installed }
}

function subscribe(fn: () => void) {
  const update = () => { snapshot = compute(); fn() }
  listeners.add(update)
  return () => { listeners.delete(update) }
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, () => snapshot)
}

// ─── Conexión ───────────────────────────────────────────────
function subscribeOnline(fn: () => void) {
  window.addEventListener('online', fn)
  window.addEventListener('offline', fn)
  return () => {
    window.removeEventListener('online', fn)
    window.removeEventListener('offline', fn)
  }
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribeOnline, () => navigator.onLine)
}
