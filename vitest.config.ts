import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

// Tests de lógica (sin navegador). Los de punta a punta están en e2e/ (Playwright).
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    // Las fechas del dominio se calculan en hora local: fijar la zona de Argentina
    env: { TZ: 'America/Argentina/Buenos_Aires' },
  },
})
