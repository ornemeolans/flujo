# flujo — Control de Gastos 💸

PWA de control de gastos *offline-first*. Los datos viven en **IndexedDB** dentro del dispositivo.  
Opcionalmente, el usuario puede iniciar sesión (Google o email + contraseña) para sincronizar sus datos entre dispositivos a través de un backend propio (`server/`).

---

## Stack

| Capa | Tecnología |
|---|---|
| UI | React 18 + Vite |
| Estado global | Zustand |
| Persistencia | IndexedDB via `idb` |
| Routing | React Router v6 |
| Gráficos | Recharts |
| PWA | `vite-plugin-pwa` + Workbox |
| Estilos | CSS Modules |
| Backend (opcional) | Node ≥ 22.13 + Express + SQLite (`node:sqlite`) |
| Auth | JWT · contraseñas con scrypt · Google Identity Services |
| Emails | [Resend](https://resend.com) (verificación y recuperación de contraseña) |

> Sin backend la app funciona completa (requerimientos 1, 2 y 3). El backend solo agrega cuentas y sincronización.

---

## Estructura del proyecto

```
flujo/
├── public/                   # Íconos, favicon
├── src/
│   ├── db/
│   │   └── index.js          # Capa IndexedDB (getAll, put, remove, export/import)
│   ├── store/
│   │   └── index.js          # Zustand store + selectors puros
│   ├── utils/
│   │   └── index.js          # Formatters, constantes (categorías, colores, etc.)
│   ├── styles/
│   │   └── global.css        # Tokens CSS, reset, animaciones
│   ├── components/
│   │   ├── Layout.jsx         # Shell: TopBar + nav + FAB
│   │   ├── TopBar.jsx
│   │   ├── BottomNav.jsx
│   │   ├── TxItem.jsx         # Fila de transacción reutilizable
│   │   ├── ui/
│   │   │   └── index.jsx      # Design system: Button, Card, Input, Modal, Switch…
│   │   └── modals/
│   │       ├── TxModal.jsx    # Alta/edición de transacciones
│   │       ├── WalletModal.jsx
│   │       ├── CardModal.jsx
│   │       └── MonthModal.jsx
│   ├── pages/
│   │   ├── Home.jsx           # Resumen + billeteras + tarjetas + últimos movimientos
│   │   ├── Transactions.jsx   # Lista filtrable del mes
│   │   ├── Wallets.jsx        # Gestión de billeteras y tarjetas
│   │   ├── Analytics.jsx      # Gráfico de torta + barras por mes
│   │   └── Settings.jsx       # Export/Import JSON, borrar datos
│   ├── App.jsx
│   └── main.jsx
├── index.html
├── vite.config.js
└── package.json
```

---

## Cómo correr localmente

```bash
npm install
npm run dev            # PWA en http://localhost:5173

# Backend (otra terminal) — Vite redirige /api a localhost:3001
cd server && npm install && cd ..
npm run dev:server
```

### Configurar el backend

Copiar `server/.env.example` a `server/.env` y completar:

- `JWT_SECRET`: obligatorio en producción (`openssl rand -hex 32`).
- `GOOGLE_CLIENT_ID`: en [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → *Crear credenciales* → *ID de cliente OAuth* → *Aplicación web*. En **Orígenes de JavaScript autorizados** agregar `http://localhost:5173` y el dominio de producción. Si queda vacío, el botón de Google no aparece y solo funciona email + contraseña.
- `RESEND_API_KEY` y `MAIL_FROM`: para enviar los emails de verificación y de recuperación de contraseña. Sin API key, los emails se imprimen en la consola del servidor (útil en desarrollo: el enlace se copia de ahí).
- `APP_URL`: URL pública de la PWA; los enlaces de los emails apuntan a `APP_URL/auth/verify` y `APP_URL/auth/reset`.
- `CORS_ORIGINS`: solo si la PWA y la API están en dominios distintos (en ese caso, buildear la PWA con `VITE_API_URL=https://api.tudominio.com/api`).

Tests del backend: `cd server && npm test`.

## Build para producción

```bash
npm run build
# Los archivos quedan en /dist — listo para Netlify, Vercel, o cualquier hosting estático
```

Para servir PWA + API desde el mismo origen: `npm run build` y luego `cd server && NODE_ENV=production npm start` (el servidor sirve `../dist` si existe). Requiere un host con Node y disco persistente para el archivo SQLite (Railway, Fly.io, un VPS, etc.).

### Con Docker

```bash
docker build -t flujo .
docker run -p 3001:3001 -v flujo-data:/data   -e JWT_SECRET=... -e GOOGLE_CLIENT_ID=... -e RESEND_API_KEY=...   -e MAIL_FROM="Flujo <hola@tudominio.com>" -e APP_URL=https://tudominio.com   flujo
```

El volumen `/data` guarda la base SQLite: sin él, los usuarios se pierden al recrear el contenedor.

## Deploy solo de la PWA en Netlify (gratis, sin cuentas)

1. Hacer `npm run build`
2. Arrastrar la carpeta `dist/` a [netlify.com/drop](https://app.netlify.com/drop)

O conectar el repo de GitHub a Netlify con:
- **Build command:** `npm run build`
- **Publish directory:** `dist`

---

## Funcionalidades

### Billeteras
- Crear/editar/eliminar billeteras ilimitadas
- Tipos: Efectivo, Virtual, Banco, Inversión, Otro
- Ícono y color personalizables
- **TNA configurable**: calcula y muestra rendimiento mensual estimado

### Tarjetas de Crédito
- Configuración de fecha de cierre por tarjeta
- **Pago del resumen**: los consumos quedan en el historial marcados como pagados (las cuotas futuras siguen pendientes)
- **Cierre ajustable por resumen**: desde el detalle de la tarjeta se puede corregir el día de cierre de un mes puntual
- **Imputación automática**: gastos antes del cierre → resumen actual; después del cierre → resumen siguiente
- Aviso en tiempo real al cargar un gasto indicando a qué resumen va (mes, día de cierre y rango de cuotas)

### Transacciones
- Ingresos y egresos
- Categorías con íconos
- Filtros por tipo y por billetera/tarjeta
- **Cuotas**: divide el gasto, registra "cuota X de Y"

### Análisis
- Gráfico de torta por categoría
- Barras de los últimos 6 meses
- Balance del mes (ingresos - egresos)

### Cuenta y sincronización (opcional)
- Registro con email + contraseña, o "Continuar con Google" (se vincula a la cuenta existente si el email coincide y Google lo verificó)
- Verificación de email y recuperación de contraseña por email (enlaces de un solo uso; restablecer la contraseña cierra las demás sesiones)
- Si alguien registró un email ajeno sin verificarlo, al entrar el dueño real con Google se descarta esa contraseña
- Al iniciar sesión, los datos locales se suben a la cuenta
- Sincronización automática: tras cada cambio, al recuperar conexión y al volver a la app
- Al cerrar sesión se suben los cambios pendientes y se borran los datos del dispositivo

### Datos
- Todo en IndexedDB (sin límite práctico de datos)
- Se pide almacenamiento persistente (`navigator.storage.persist()`) para que el navegador no lo borre
- Export/Import en JSON para backup
- Funciona 100% offline gracias al Service Worker

---

## Arquitectura de datos (IndexedDB)

```
wallets       { id, name, type, initialBalance, icon, color, tnaEnabled, tna, …sync }
cards         { id, name, closeDay, closeOverrides: { 'YYYY-MM': día }, icon, color, …sync }
transactions  { id, amount, type, date, category, walletId, desc, cuotas, cuotaActual, …sync }

…sync = { updatedAt, deletedAt }   // ms epoch; deletedAt ≠ null → borrado (tombstone)
```

- Los ids son UUID, así no chocan entre dispositivos. Los rendimientos diarios usan `yield-<walletId>-<fecha>` para que dos dispositivos no los dupliquen.
- Los borrados son *soft delete*: el registro queda marcado para poder propagar el borrado.

### Sincronización

`POST /api/sync { since, changes }`: el cliente sube los registros modificados desde la última sync y recibe todo lo que cambió en el servidor después del cursor `since`. Ante conflictos gana el `updatedAt` más reciente (*last-write-wins*).

El balance de cada billetera es siempre **calculado** (no almacenado):  
`balance = initialBalance + sum(ingresos) - sum(egresos)`

Esto evita inconsistencias y permite recalcular en cualquier momento.
