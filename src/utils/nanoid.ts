// UUID v4: ids globalmente únicos, necesarios para sincronizar entre dispositivos
export function nanoid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return crypto.randomUUID()
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10)
}
