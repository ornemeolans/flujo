// URL del backend. En desarrollo Vite redirige /api a localhost:3001 (ver vite.config.js)
const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export async function api(path, { body, token } = {}) {
  let res
  try {
    res = await fetch(API_URL + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(body && { 'content-type': 'application/json' }),
        ...(token && { authorization: `Bearer ${token}` }),
      },
      body: body && JSON.stringify(body),
    })
  } catch {
    throw new ApiError('Sin conexión con el servidor', 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error || `Error ${res.status}`, res.status)
  return data
}
