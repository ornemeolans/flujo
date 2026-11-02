import { useEffect, useState } from 'react'
import { useAuth } from '@/store/auth'
import { api, ApiError } from './api'

let enabled = null // se consulta una vez; un fallo de red no se recuerda

/** La IA pasa por la API: hace falta sesión y que el servidor tenga clave de Gemini */
export function useAiAvailable() {
  const signedIn = useAuth(s => !!s.token)
  const [available, setAvailable] = useState(enabled)

  useEffect(() => {
    if (!signedIn || enabled !== null) return
    let active = true
    api('/config')
      .then(({ aiEnabled }) => {
        enabled = !!aiEnabled
        if (active) setAvailable(enabled)
      })
      .catch(() => {})
    return () => { active = false }
  }, [signedIn])

  return signedIn && !!available
}

export async function aiRequest(path, body) {
  const { token } = useAuth.getState()
  try {
    return await api(path, { body, token })
  } catch (e) {
    throw new Error(e instanceof ApiError && e.status === 0 ? 'Necesitás conexión para usar esta función' : e.message)
  }
}
