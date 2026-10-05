import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/store/auth'
import { Section, Card, Button, Input, Spinner } from '@/components/ui'
import styles from '@/components/AccountSection.module.css'

// Destino de los enlaces enviados por email:
//   /auth/verify?token=…  → confirma el email
//   /auth/reset?token=…   → elegir nueva contraseña
export default function AuthAction() {
  const { action } = useParams()
  const [params] = useSearchParams()
  const token = params.get('token') || ''

  return (
    <div className="animate-fadeUp">
      <Section title={action === 'reset' ? 'Nueva contraseña' : 'Confirmar email'}>
        <Card>
          {action === 'reset' ? <Reset token={token} /> : <Verify token={token} />}
        </Card>
      </Section>
    </div>
  )
}

function Verify({ token }) {
  const navigate = useNavigate()
  const verifyEmail = useAuth(s => s.verifyEmail)
  const [state, setState] = useState({ status: 'loading' })
  const done = useRef(false) // el token es de un solo uso: evitar el doble efecto de StrictMode

  useEffect(() => {
    if (done.current) return
    done.current = true
    verifyEmail(token)
      .then(() => setState({ status: 'ok' }))
      .catch(e => setState({ status: 'error', message: e.message }))
  }, [token, verifyEmail])

  if (state.status === 'loading') return <Spinner />
  return (
    <>
      <p className={styles.desc}>
        {state.status === 'ok' ? '✓ Tu email quedó confirmado.' : state.message}
      </p>
      <Button variant="primary" size="lg" className={styles.submit} onClick={() => navigate('/', { replace: true })}>
        Ir al inicio
      </Button>
    </>
  )
}

function Reset({ token }) {
  const navigate = useNavigate()
  const { user, resetPassword } = useAuth()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // Con otra sesión abierta, los datos locales se mezclarían con la otra cuenta
  if (user) {
    return (
      <>
        <p className={styles.desc}>
          Tenés una sesión iniciada como <strong>{user.email}</strong>. Para usar este enlace,
          primero cerrá sesión desde Ajustes y volvé a abrirlo.
        </p>
        <Button variant="ghost" size="lg" className={styles.submit} onClick={() => navigate('/settings')}>
          Ir a Ajustes
        </Button>
      </>
    )
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres')
    if (password !== confirm) return setError('Las contraseñas no coinciden')
    setBusy(true)
    setError(null)
    try {
      await resetPassword(token, password)
      navigate('/settings', { replace: true })
    } catch (e) {
      setError(e.message)
      setBusy(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <Input label="Nueva contraseña" type="password" autoComplete="new-password" required value={password}
        onChange={e => setPassword(e.target.value)} hint="Mínimo 8 caracteres" />
      <Input label="Repetir contraseña" type="password" autoComplete="new-password" required value={confirm}
        onChange={e => setConfirm(e.target.value)} />
      {error && <div className={styles.error}>{error}</div>}
      <Button type="submit" variant="primary" size="lg" disabled={busy} className={styles.submit}>
        {busy ? 'Guardando…' : 'Guardar y entrar'}
      </Button>
    </form>
  )
}
