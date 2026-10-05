import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/store/auth'
import { api } from '@/sync/api'
import { Section, Card, Button, Input, Spinner } from '@/components/ui'
import styles from './AccountSection.module.css'

export default function AccountSection() {
  const user = useAuth(s => s.user)
  return (
    <Section title="Cuenta">
      <Card>{user ? <SignedIn /> : <SignedOut />}</Card>
    </Section>
  )
}

// ─── Con sesión ──────────────────────────────────────────────
function SignedIn() {
  const { user, syncing, syncError, lastSyncAt, syncNow, logout, deleteAccount, resendVerification } = useAuth()
  const [busy, setBusy] = useState(false)
  const [verifyMsg, setVerifyMsg] = useState(null)

  async function handleResend() {
    setVerifyMsg('Enviando…')
    try {
      await resendVerification()
      setVerifyMsg(`Te enviamos un enlace a ${user.email}`)
    } catch (e) {
      setVerifyMsg(e.message)
    }
  }

  async function handleLogout() {
    if (!confirm('¿Cerrar sesión? Los datos se borran de este dispositivo y quedan guardados en tu cuenta.')) return
    setBusy(true)
    try {
      await logout()
    } catch (e) {
      if (confirm(`${e.message}\n\n¿Cerrar sesión igual? Se perderán los cambios no sincronizados.`)) {
        await logout({ force: true })
      }
    }
    setBusy(false)
  }

  async function handleDeleteAccount() {
    if (!confirm('¿Eliminar tu cuenta? Se borran tu cuenta y todos tus datos del servidor y de este dispositivo. No se puede deshacer.\n\nSi querés conservar tus datos, primero exportá un backup.')) return
    if (prompt('Para confirmar, escribí ELIMINAR') !== 'ELIMINAR') return
    setBusy(true)
    try {
      await deleteAccount()
    } catch (e) {
      alert(`No se pudo eliminar la cuenta: ${e.message}`)
    }
    setBusy(false)
  }

  return (
    <>
      <div className={styles.userRow}>
        <div className={styles.avatar}>{(user.name || user.email)[0].toUpperCase()}</div>
        <div className={styles.userInfo}>
          <div className={styles.userName}>{user.name || user.email}</div>
          {user.name && <div className={styles.userEmail}>{user.email}</div>}
        </div>
      </div>

      {!user.emailVerified && (
        <div className={styles.notice}>
          Confirmá tu email para poder recuperar la cuenta si olvidás la contraseña.{' '}
          {verifyMsg ?? <button className={styles.link} onClick={handleResend}>Reenviar enlace</button>}
        </div>
      )}

      <div className={`${styles.syncStatus} ${syncError ? styles.syncError : ''}`}>
        {syncing ? 'Sincronizando…'
          : syncError ? `⚠ ${syncError}`
          : lastSyncAt ? `✓ Sincronizado ${new Date(lastSyncAt).toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' })}`
          : 'Pendiente de sincronizar'}
      </div>

      <div className={styles.actions}>
        <Button variant="ghost" size="md" onClick={() => syncNow()} disabled={syncing}>Sincronizar ahora</Button>
        <Button variant="danger" size="md" onClick={handleLogout} disabled={busy}>Cerrar sesión</Button>
      </div>

      <button className={`${styles.link} ${styles.linkBlock} ${styles.deleteLink}`} onClick={handleDeleteAccount} disabled={busy}>
        Eliminar mi cuenta
      </button>
    </>
  )
}

// ─── Sin sesión ──────────────────────────────────────────────
function SignedOut() {
  const { login, register, loginWithGoogle, forgotPassword, syncError } = useAuth()
  const [mode, setMode] = useState('login') // 'login' | 'register' | 'forgot'
  const [sent, setSent] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [error, setError] = useState(syncError)
  const [busy, setBusy] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function run(fn) {
    setBusy(true)
    setError(null)
    try { await fn() } catch (e) { setError(e.message) }
    setBusy(false)
  }

  function handleSubmit(e) {
    e.preventDefault()
    if (mode === 'forgot') return run(async () => { await forgotPassword(form.email); setSent(true) })
    if (mode === 'register' && form.password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres')
    run(() => mode === 'login' ? login(form) : register(form))
  }

  if (mode === 'forgot') {
    return (
      <form onSubmit={handleSubmit}>
        <p className={styles.desc}>
          {sent
            ? `Si ${form.email} tiene una cuenta, te llegará un email con un enlace para elegir una nueva contraseña. Revisá también la carpeta de spam.`
            : 'Ingresá tu email y te enviamos un enlace para elegir una nueva contraseña.'}
        </p>
        {!sent && (
          <Input label="Email" type="email" autoComplete="email" required value={form.email} onChange={e => set('email', e.target.value)} />
        )}
        {error && <div className={styles.error}>{error}</div>}
        {!sent && (
          <Button type="submit" variant="primary" size="lg" disabled={busy} className={styles.submit}>
            {busy ? 'Un momento…' : 'Enviar enlace'}
          </Button>
        )}
        <button type="button" className={`${styles.link} ${styles.linkBlock}`} onClick={() => { setMode('login'); setSent(false); setError(null) }}>
          ← Volver a ingresar
        </button>
      </form>
    )
  }

  return (
    <>
      <p className={styles.desc}>
        Opcional: iniciá sesión para guardar tus datos en la nube y sincronizarlos entre dispositivos.
        Sin cuenta, la app sigue funcionando 100% local.
      </p>

      <GoogleButton onCredential={c => run(() => loginWithGoogle(c))} />

      <div className={styles.divider}><span>o con tu email</span></div>

      <div className={styles.tabs}>
        <button type="button" className={mode === 'login' ? styles.tabOn : ''} onClick={() => setMode('login')}>Ingresar</button>
        <button type="button" className={mode === 'register' ? styles.tabOn : ''} onClick={() => setMode('register')}>Crear cuenta</button>
      </div>

      <form onSubmit={handleSubmit}>
        {mode === 'register' && (
          <Input label="Nombre" autoComplete="name" value={form.name} onChange={e => set('name', e.target.value)} />
        )}
        <Input label="Email" type="email" autoComplete="email" required value={form.email} onChange={e => set('email', e.target.value)} />
        <Input
          label="Contraseña"
          type="password"
          required
          autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
          value={form.password}
          onChange={e => set('password', e.target.value)}
          hint={mode === 'register' ? 'Mínimo 8 caracteres' : undefined}
        />
        {error && <div className={styles.error}>{error}</div>}
        <Button type="submit" variant="primary" size="lg" disabled={busy} className={styles.submit}>
          {busy ? 'Un momento…' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
        </Button>
        {mode === 'login' && (
          <button type="button" className={`${styles.link} ${styles.linkBlock}`} onClick={() => { setMode('forgot'); setError(null) }}>
            ¿Olvidaste tu contraseña?
          </button>
        )}
      </form>
    </>
  )
}

// ─── Botón "Continuar con Google" (Google Identity Services) ─
const GSI_SRC = 'https://accounts.google.com/gsi/client'
let gsiPromise = null
function loadGsi() {
  gsiPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement('script')
    s.src = GSI_SRC
    s.async = true
    s.onload = () => resolve(window.google)
    s.onerror = () => { gsiPromise = null; reject(new Error('No se pudo cargar Google')) }
    document.head.appendChild(s)
  })
  return gsiPromise
}

function GoogleButton({ onCredential }) {
  const ref = useRef(null)
  const cb = useRef(onCredential)
  cb.current = onCredential
  const [state, setState] = useState('loading') // loading | ready | off

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { googleClientId } = await api('/config')
        if (!googleClientId) throw new Error('sin client id')
        const google = await loadGsi()
        if (cancelled) return
        google.accounts.id.initialize({
          client_id: googleClientId,
          callback: r => cb.current(r.credential),
        })
        google.accounts.id.renderButton(ref.current, {
          theme: 'filled_black', size: 'large', shape: 'pill', text: 'continue_with', locale: 'es',
          width: Math.min(ref.current.offsetWidth || 300, 400),
        })
        setState('ready')
      } catch {
        if (!cancelled) setState('off')
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (state === 'off') return null
  return (
    <div className={styles.google}>
      {state === 'loading' && <Spinner size={18} />}
      <div ref={ref} />
    </div>
  )
}
