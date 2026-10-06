import webpush from 'web-push'

// Web Push con claves VAPID. Sin claves devuelve null y las notificaciones quedan desactivadas.
// Generar claves: npx web-push generate-vapid-keys
export function createPush({ publicKey, privateKey, subject }) {
  if (!publicKey || !privateKey) return null
  webpush.setVapidDetails(subject, publicKey, privateKey)
  return {
    publicKey,
    send: (subscription, payload) => webpush.sendNotification(subscription, JSON.stringify(payload), { TTL: 24 * 60 * 60 }),
  }
}
