import { useMemo, useState } from 'react'
import { searchEntities } from '@/bcra'
import { Spinner } from '@/components/ui'
import styles from './Bcra.module.css'

export const KIND_ICON = { bank: '🏦', virtual: '📱', other: '🏢' }

/**
 * Lista buscable de entidades del BCRA.
 * mode="single": onSelect(entity). mode="multi": selected (Set de códigos) + onToggle(entity).
 */
export function EntityPicker({ catalog, mode = 'single', selected, onSelect, onToggle, filter, onManual, manualLabel = 'No está en la lista: cargarla a mano' }) {
  const [query, setQuery] = useState('')
  const { status, entities, error, retry } = catalog

  const visible = useMemo(() => {
    const list = filter ? entities.filter(filter) : entities
    return searchEntities(list, query)
  }, [entities, filter, query])

  const known = visible.filter(e => e.featured)
  const others = visible.filter(e => !e.featured)

  const row = entity => {
    const isOn = mode === 'multi' && selected?.has(entity.code)
    return (
      <li key={entity.code}>
        <button
          type="button"
          className={`${styles.row} ${isOn ? styles.rowOn : ''}`}
          onClick={() => (mode === 'multi' ? onToggle(entity) : onSelect(entity))}
          aria-pressed={mode === 'multi' ? isOn : undefined}
        >
          <span className={styles.rowIcon} aria-hidden="true">{KIND_ICON[entity.kind]}</span>
          <span className={styles.rowText}>
            <span className={styles.rowName}>{entity.name}</span>
            {entity.legalName !== entity.name.toUpperCase() && <span className={styles.rowSub}>{entity.legalName}</span>}
          </span>
          {mode === 'multi'
            ? <span className={`${styles.check} ${isOn ? styles.checkOn : ''}`} aria-hidden="true">{isOn ? '✓' : ''}</span>
            : <span className={styles.chevron} aria-hidden="true">›</span>}
        </button>
      </li>
    )
  }

  return (
    <div className={styles.picker}>
      <label className={styles.searchLabel} htmlFor="bcra-search">Buscar banco o billetera</label>
      <input
        id="bcra-search"
        className={styles.search}
        type="search"
        placeholder="Ej: Galicia, Mercado Pago, Ualá"
        value={query}
        onChange={e => setQuery(e.target.value)}
        autoComplete="off"
      />

      {status === 'loading' && (
        <div className={styles.state}><Spinner size={22} /> Cargando la lista del BCRA…</div>
      )}
      {status === 'error' && (
        <div className={styles.stateError} role="alert">
          {error}
          <button type="button" className={styles.linkBtn} onClick={retry}>Reintentar</button>
        </div>
      )}
      {status === 'ready' && catalog.catalog?.stale && (
        <p className={styles.note}>Sin conexión: se muestra la lista guardada.</p>
      )}

      {status === 'ready' && (
        visible.length === 0
          ? <p className={styles.note}>No encontramos “{query}”.</p>
          : (
            <>
              {known.length > 0 && <h3 className={styles.groupTitle}>Más usadas</h3>}
              <ul className={styles.list}>{known.map(row)}</ul>
              {others.length > 0 && <h3 className={styles.groupTitle}>{known.length ? 'Todas las entidades' : 'Entidades'}</h3>}
              <ul className={styles.list}>{others.map(row)}</ul>
            </>
          )
      )}

      {onManual && (
        <button type="button" className={styles.manual} onClick={onManual}>{manualLabel}</button>
      )}
      <p className={styles.source}>Fuente: Régimen de Transparencia del BCRA.</p>
    </div>
  )
}
