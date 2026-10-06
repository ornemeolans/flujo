import { api } from '@/sync/api'

// Notificaciones push de recordatorios (cuotas y cierres de tarjeta).
// El servidor decide cuándo avisar (necesita los datos sincronizados), así que
// requieren sesión iniciada. En iPhone solo funcionan con la app instalada.

export type PushState = 'unsupported' | 'denied' | 'off' | 'on'

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  // En desarrollo no hay service worker: ready nunca resolvería
  const reg = await navigator.serviceWorker.getRegistration()
  return reg ? navigator.serviceWorker.ready : null
}

export async function getPushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await registration()
  if (!reg) return 'unsupported'
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off'
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(padded)
  const out = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

export async function enablePush(token: string): Promise<PushState> {
  const reg = await registration()
  if (!reg) throw new Error('Este navegador no admite notificaciones')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const { publicKey } = await api<{ publicKey: string }>('/push/key')
  const sub = await reg.pushManager.getSubscription()
    ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) })
  await api('/push/subscribe', { token, body: { subscription: sub.toJSON() } })
  return 'on'
}

export async function disablePush(token: string | null): Promise<PushState> {
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) {
    if (token) await api('/push/unsubscribe', { token, body: { endpoint: sub.endpoint } }).catch(() => {})
    await sub.unsubscribe()
  }
  return 'off'
}

export async function sendTestPush(token: string): Promise<number> {
  const { sent } = await api<{ sent: number }>('/push/test', { token, body: {} })
  return sent
}
