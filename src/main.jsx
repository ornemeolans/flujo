import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { requestPersistentStorage } from './db'
// Fuentes servidas desde la app (sin pedir a Google Fonts: no bloquean el render y funcionan offline)
import '@fontsource/dm-sans/latin-400.css'
import '@fontsource/dm-sans/latin-500.css'
import '@fontsource/dm-sans/latin-600.css'
import '@fontsource/dm-serif-display/latin-400.css'
import './styles/global.css'
import './theme'
import './pwa/install' // captura beforeinstallprompt lo antes posible

// Evita que el navegador borre IndexedDB cuando necesita liberar espacio
requestPersistentStorage()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
)
