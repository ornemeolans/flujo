import { useEffect, useState } from 'react'
import { loadCatalog } from '@/bcra'
import styles from './Bcra.module.css'

const pct = n => n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

/** Tasa máxima de financiación que la entidad informa al BCRA para esa tarjeta */
export function CardRate({ entityCode, product }) {
  const [tea, setTea] = useState(null)

  useEffect(() => {
    let active = true
    loadCatalog()
      .then(({ entities }) => {
        const found = entities.find(e => e.code === entityCode)?.cards.find(c => c.name === product)
        if (active && found?.tea > 0) setTea(found.tea)
      })
      .catch(() => {}) // sin conexión ni copia guardada: simplemente no se muestra
    return () => { active = false }
  }, [entityCode, product])

  if (!tea) return null
  return <p className={styles.rate}>Financiación de saldo: hasta {pct(tea)}% TEA, según el BCRA.</p>
}
