import { useState } from 'react'
import { useStore } from '@/store'
import { exportAllData, importAllData } from '@/db'
import { Section, Card, Button, Switch } from '@/components/ui'
import AccountSection from '@/components/AccountSection'
import { useAuth } from '@/store/auth'
import { useTheme, setThemePref } from '@/theme'
import styles from './Settings.module.css'

export default function Settings() {
  const { wallets, cards, transactions, loadAll } = useStore()
  const signedIn = useAuth(s => !!s.user)
  const { theme, followsSystem } = useTheme()
  const [msg, setMsg] = useState('')

  function flash(text) { setMsg(text); setTimeout(() => setMsg(''), 3000) }

  async function handleExport() {
    try {
      const data = await exportAllData()
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url  = URL.createObjectURL(blob)
      const a    = document.createElement('a')
      a.href = url
      a.download = `flujo-backup-${new Date().toISOString().slice(0,10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      flash('Backup exportado ✓')
    } catch (e) {
      flash('Error al exportar')
    }
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const data = JSON.parse(text)
      if (!data.wallets || !data.cards || !data.transactions) throw new Error('Formato inválido')
      if (!confirm(`¿Importar backup? Esto reemplazará todos tus datos actuales.`)) return
      await importAllData(data)
      await loadAll()
      flash('Datos importados correctamente ✓')
    } catch (e) {
      flash('Error: archivo inválido')
    }
    e.target.value = ''
  }

  async function handleClear() {
    const scope = signedIn ? ' de este dispositivo y de tu cuenta' : ''
    if (!confirm(`¿Borrar TODOS los datos${scope}? Esta acción no se puede deshacer.`)) return
    await importAllData({ wallets: [], cards: [], transactions: [] })
    await loadAll()
    flash('Datos borrados')
  }

  return (
    <div className="animate-fadeUp">
      {msg && <div className={styles.toast}>{msg}</div>}

      <AccountSection />

      {/* Apariencia */}
      <Section title="Apariencia">
        <Card>
          <Switch
            label="Modo oscuro"
            checked={theme === 'dark'}
            onChange={dark => setThemePref(dark ? 'dark' : 'light')}
          />
          <p className={styles.themeHint}>
            {followsSystem
              ? 'Sigue la configuración de tu dispositivo.'
              : <>Elegido a mano. <button className={styles.linkBtn} onClick={() => setThemePref(null)}>Usar el del dispositivo</button></>}
          </p>
        </Card>
      </Section>

      {/* Stats */}
      <Section title="Resumen de datos">
        <Card>
          <div className={styles.statsGrid}>
            <div className={styles.stat}>
              <div className={styles.statVal}>{wallets.length}</div>
              <div className={styles.statLabel}>Billeteras</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statVal}>{cards.length}</div>
              <div className={styles.statLabel}>Tarjetas</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statVal}>{transactions.length}</div>
              <div className={styles.statLabel}>Transacciones</div>
            </div>
          </div>
        </Card>
      </Section>

      {/* Backup */}
      <Section title="Backup y Restauración">
        <Card>
          <p className={styles.desc}>
            Tus datos se guardan localmente en este dispositivo usando IndexedDB
            {signedIn ? ' y se sincronizan con tu cuenta.' : '. Exportá un backup o iniciá sesión para no perderlos si limpiás el navegador.'}
          </p>
          <div className={styles.backupActions}>
            <Button variant="ghost" size="md" onClick={handleExport} className={styles.backupBtn}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Exportar backup
            </Button>
            <label className={styles.importLabel}>
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Importar backup
              <input type="file" accept=".json" onChange={handleImport} style={{ display: 'none' }} />
            </label>
          </div>
        </Card>
      </Section>

      {/* Danger */}
      <Section title="Zona peligrosa">
        <Card>
          <Button variant="danger" size="md" onClick={handleClear}>
            Borrar todos los datos
          </Button>
        </Card>
      </Section>

      {/* About */}
      <Section title="Acerca de">
        <Card>
          <div className={styles.about}>
            <div className={styles.aboutLogo}>flu<span>jo</span></div>
            <div className={styles.aboutDesc}>
              App de control de gastos que funciona offline.<br />
              La cuenta es opcional: solo sirve para sincronizar.
            </div>
            <div className={styles.aboutVersion}>v1.1.0 — PWA</div>
            <a className={styles.aboutLink} href="/privacidad.html">Política de privacidad</a>
          </div>
        </Card>
      </Section>
    </div>
  )
}
