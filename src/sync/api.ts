// URL del backend. En desarrollo Vite redirige /api a localhost:3001 (ver vite.config.js)
const API_URL = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '')

export class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export async function api<T = any>(path: string, { body, token }: { body?: unknown; token?: string | null } = {}): Promise<T> {
  let res: Response
  try {
    const headers: Record<string, string> = {}
    if (body) headers['content-type'] = 'application/json'
    if (token) headers.authorization = `Bearer ${token}`
    res = await fetch(API_URL + path, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })
  } catch {
    throw new ApiError('Sin conexión con el servidor', 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(data.error || `Error ${res.status}`, res.status)
  return data
}
