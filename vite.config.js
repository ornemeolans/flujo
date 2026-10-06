import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // prompt: la versión nueva se aplica cuando la persona toca "Actualizar" (src/pwa/PwaStatus.jsx)
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Flujo — Control de Gastos',
        short_name: 'Flujo',
        description: 'Controlá tus gastos, billeteras y tarjetas de crédito',
        theme_color: '#EAEAE6',
        background_color: '#EAEAE6',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
        ]
      },
      workbox: {
        // Manejo de notificaciones push (public/push-sw.js)
        importScripts: ['push-sw.js'],
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        // La API nunca se sirve desde el cache ni cae en el fallback de la SPA
        navigateFallbackDenylist: [/^\/api\//],
      }
    })
  ],
  server: {
    proxy: { '/api': 'http://localhost:3001' }
  },
  resolve: {
    alias: { '@': '/src', '@shared': '/shared' }
  }
})
