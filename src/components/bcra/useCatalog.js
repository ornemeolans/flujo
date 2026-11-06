import { useCallback, useEffect, useState } from 'react'
import { loadCatalog } from '@/bcra'

/** Lista de entidades del BCRA, con estado de carga y reintento */
export function useCatalog() {
  const [state, setState] = useState({ status: 'loading', catalog: null, error: null })

  const load = useCallback((force = false) => {
    setState(s => ({ ...s, status: 'loading', error: null }))
    loadCatalog({ force })
      .then(catalog => setState({ status: 'ready', catalog, error: null }))
      .catch(e => setState({ status: 'error', catalog: null, error: e.message }))
  }, [])

  useEffect(() => { load() }, [load])

  return { ...state, entities: state.catalog?.entities ?? [], retry: () => load(true) }
}
