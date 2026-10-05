import { create } from 'zustand'
import { api } from '@/sync/api'
import { changesSince, applyRemote, wipeLocal, onLocalChange } from '@/db'
import { useStore } from '@/store'

// ─── Persistencia de la sesión (localStorage) ───────────────
const KEY_SESSION = 'flujo.session'
const KEY_SYNC = 'flujo.sync'

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback } catch { return fallback }
}
function write(key, value) {
  try {
    if (value == null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch { /* almacenamiento no disponible */ }
}

// cursor:   último seq del servidor ya recibido
// pushedAt: updatedAt local hasta el que ya se subieron cambios
const EMPTY_SYNC = { cursor: 0, pushedAt: 0, lastSyncAt: null }

const session = read(KEY_SESSION, null)

export const useAuth = create((set, get) => ({
  token: session?.token ?? null,
  user: session?.user ?? null,
  syncing: false,
  syncError: null,
  lastSyncAt: read(KEY_SYNC, EMPTY_SYNC).lastSyncAt,

  async register({ email, password, name }) {
    startSession(await api('/auth/register', { body: { email, password, name } }))
  },

  async login({ email, password }) {
    startSession(await api('/auth/login', { body: { email, password } }))
  },

  async loginWithGoogle(credential) {
    startSession(await api('/auth/google', { body: { credential } }))
  },

  async forgotPassword(email) {
    await api('/auth/forgot-password', { body: { email } })
  },

  // Desde el enlace del email; inicia sesión con la nueva contraseña
  async resetPassword(token, password) {
    startSession(await api('/auth/reset-password', { body: { token, password } }))
  },

  async verifyEmail(token) {
    await api('/auth/verify-email', { body: { token } })
    await get().refreshUser()
  },

  async resendVerification() {
    await api('/auth/resend-verification', { body: {}, token: get().token })
  },

  // Actualiza los datos del usuario (p. ej. email verificado desde otro dispositivo)
  async refreshUser() {
    const { token } = get()
    if (!token) return
    try {
      const { user } = await api('/auth/me', { token })
      write(KEY_SESSION, { token, user })
      set({ user })
    } catch (e) {
      if (e.status === 401) {
        write(KEY_SESSION, null)
        set({ token: null, user: null, syncError: 'Sesión vencida, volvé a iniciar sesión' })
      }
    }
  },

  // Sube los cambios pendientes y borra los datos de este dispositivo:
  // quedan guardados en la cuenta y vuelven al iniciar sesión.
  async logout({ force = false } = {}) {
    if (!force) {
      await get().syncNow()
      if (get().syncError) throw new Error(`No se pudieron subir los últimos cambios: ${get().syncError}`)
    }
    set({ token: null, user: null, syncError: null, lastSyncAt: null })
    write(KEY_SESSION, null)
    write(KEY_SYNC, null)
    await wipeLocal()
    await useStore.getState().refresh()
  },

  // Borra la cuenta y sus datos del servidor, y los datos de este dispositivo
  async deleteAccount() {
    await api('/auth/delete-account', { body: {}, token: get().token })
    await get().logout({ force: true })
  },

  syncNow,
}))

function startSession({ token, user }) {
  write(KEY_SESSION, { token, user })
  // Cuenta nueva en este dispositivo: subir todo lo local y bajar todo lo remoto
  write(KEY_SYNC, EMPTY_SYNC)
  useAuth.setState({ token, user, syncError: null, lastSyncAt: null })
  syncNow()
}

// ─── Motor de sincronización ────────────────────────────────
let running = null
let again = false

async function syncNow() {
  if (!useAuth.getState().token) return
  if (running) { again = true; return running }

  running = (async () => {
    useAuth.setState({ syncing: true })
    try {
      do {
        again = false
        await syncOnce()
      } while (again)
      useAuth.setState({ syncError: null })
    } catch (e) {
      if (e.status === 401) {
        // Sesión vencida: se conservan los datos locales; se mezclan al volver a entrar
        write(KEY_SESSION, null)
        useAuth.setState({ token: null, user: null, syncError: 'Sesión vencida, volvé a iniciar sesión' })
      } else {
        useAuth.setState({ syncError: e.message })
      }
    } finally {
      useAuth.setState({ syncing: false })
      running = null
    }
  })()
  return running
}

async function syncOnce() {
  const { token } = useAuth.getState()
  const state = read(KEY_SYNC, EMPTY_SYNC)
  // -1 ms: un cambio hecho en el mismo milisegundo que el envío se reenvía la próxima vez
  const startedAt = Date.now() - 1

  const changes = await changesSince(state.pushedAt)
  const res = await api('/sync', { token, body: { since: state.cursor, changes } })
  const applied = await applyRemote(res.changes)

  const lastSyncAt = Date.now()
  write(KEY_SYNC, { cursor: res.cursor, pushedAt: startedAt, lastSyncAt })
  useAuth.setState({ lastSyncAt })
  if (applied > 0) await useStore.getState().refresh()
}

// ─── Disparadores automáticos ───────────────────────────────
let debounce = null
let started = false
export function startAutoSync() {
  if (started) return
  started = true
  onLocalChange(() => {
    clearTimeout(debounce)
    debounce = setTimeout(syncNow, 1500)
  })
  window.addEventListener('online', syncNow)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow()
  })
  useAuth.getState().refreshUser()
  syncNow()
}
