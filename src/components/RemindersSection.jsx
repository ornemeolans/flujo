import { useEffect, useState } from 'react'
import { useAuth } from '@/store/auth'
import { Section, Card, Switch, Button } from '@/components/ui'
import { getPushState, enablePush, disablePush, sendTestPush } from '@/pwa/push'
import styles from './AccountSection.module.css'

export default function RemindersSection() {
  const token = useAuth(s => s.token)
  const [state, setState] = useState(null) // null = cargando
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)

  useEffect(() => { getPushState().then(setState) }, [])

  async function run(fn) {
    setBusy(true)
    setMsg(null)
    try { await fn() } catch (e) { setMsg(e.message) }
    setBusy(false)
  }

  const toggle = on => run(async () => setState(on ? await enablePush(token) : await disablePush(token)))
  const test = () => run(async () => {
    const sent = await sendTestPush(token)
    setMsg(sent ? 'Enviada: debería llegarte en unos segundos.' : 'No se pudo enviar.')
  })

  return (
    <Section title="Recordatorios">
      <Card>
        <p className={styles.desc}>
          Te avisamos el día antes de que venza la cuota de un préstamo y 2 días antes
          del cierre de tus tarjetas, a partir de las 9.
        </p>
        {!token ? (
          <p className={styles.desc}>Iniciá sesión para activarlos: los avisos los envía el servidor con tus datos sincronizados.</p>
        ) : state === 'unsupported' ? (
          <p className={styles.desc}>Este navegador no admite notificaciones. En iPhone, instalá la app (Compartir → Agregar a inicio) y abrila desde el ícono.</p>
        ) : state === 'denied' ? (
          <p className={styles.desc}>Bloqueaste las notificaciones para Flujo. Habilitalas desde la configuración del navegador y volvé a intentar.</p>
        ) : state && (
          <>
            <Switch label="Avisarme de vencimientos" checked={state === 'on'} onChange={v => !busy && toggle(v)} />
            {state === 'on' && (
              <Button variant="ghost" size="md" onClick={test} disabled={busy} style={{ marginTop: 12 }}>
                Enviar notificación de prueba
              </Button>
            )}
          </>
        )}
        {msg && <div className={styles.syncStatus} role="status">{msg}</div>}
      </Card>
    </Section>
  )
}
