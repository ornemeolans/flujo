import { useRegisterSW } from 'virtual:pwa-register/react'
import { useOnline } from './install'
import styles from './PwaStatus.module.css'

const HOUR = 60 * 60 * 1000

// Avisos globales de la PWA: sin conexión y versión nueva disponible.
// El service worker está en modo "prompt": la versión nueva se aplica cuando
// la persona toca "Actualizar", así no se recarga en medio de una carga.
export default function PwaStatus() {
  const online = useOnline()
  const { needRefresh: [needRefresh], updateServiceWorker } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Una app instalada puede quedar abierta días: buscar versiones nuevas cada hora
      if (registration) setInterval(() => registration.update(), HOUR)
    },
  })

  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      {!online && (
        <div className={`${styles.banner} ${styles.offline}`}>
          <span className={styles.dot} aria-hidden="true" />
          Sin conexión · tus cambios se guardan y se sincronizan al volver
        </div>
      )}
      {needRefresh && (
        <div className={`${styles.banner} ${styles.update}`}>
          <span>Hay una versión nueva de Flujo</span>
          <button type="button" className={styles.action} onClick={() => updateServiceWorker(true)}>
            Actualizar
          </button>
        </div>
      )}
    </div>
  )
}
