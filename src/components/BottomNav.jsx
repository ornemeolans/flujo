import { useLocation, useNavigate } from 'react-router-dom'
import styles from './BottomNav.module.css'

const NAV_ITEMS = [
  {
    path: '/', label: 'Inicio',
    icon: <svg fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 10.5L12 4l8 6.5V19a1.5 1.5 0 01-1.5 1.5H15v-5.5a1 1 0 00-1-1h-4a1 1 0 00-1 1v5.5H5.5A1.5 1.5 0 014 19z"/></svg>
  },
  {
    path: '/transactions', label: 'Movimientos',
    icon: <svg fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3"/></svg>
  },
  {
    path: '/wallets', label: 'Cuentas',
    icon: <svg fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 7.5A2.5 2.5 0 016.5 5h11A2.5 2.5 0 0120 7.5v9a2.5 2.5 0 01-2.5 2.5h-11A2.5 2.5 0 014 16.5z"/><path d="M15.5 12h4.5"/><circle cx="15.5" cy="12" r=".6" fill="currentColor"/></svg>
  },
  {
    path: '/analytics', label: 'Análisis',
    icon: <svg fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M12 3.5a8.5 8.5 0 108.5 8.5H12z"/><path d="M15 3.8A8.5 8.5 0 0120.2 9H15z"/></svg>
  },
  {
    path: '/settings', label: 'Config',
    icon: <svg fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/></svg>
  },
]

export default function BottomNav() {
  const location = useLocation()
  const navigate = useNavigate()

  return (
    <nav className={styles.nav} aria-label="Principal">
      <div className={styles.inner}>
        {NAV_ITEMS.map(item => {
          const active = location.pathname === item.path
          return (
            <button
              key={item.path}
              className={`${styles.btn} ${active ? styles.active : ''}`}
              onClick={() => navigate(item.path)}
              aria-label={item.label}
              aria-current={active ? 'page' : undefined}
            >
              <span className={styles.icon} aria-hidden="true">{item.icon}</span>
              <span className={styles.label}>{item.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
