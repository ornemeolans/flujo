// Genera la imagen Open Graph y versiones WebP livianas de las capturas para la landing.
//   node tools/render-images.mjs   (después de: SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts)
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync, copyFileSync, readdirSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })

await page.goto(pathToFileURL(resolve(root, 'tools/og-image.html')).href)
await page.evaluate(() => document.fonts.ready)
await page.screenshot({ path: resolve(root, 'public/og.png') })
mkdirSync(resolve(root, 'landing/img'), { recursive: true })
copyFileSync(resolve(root, 'public/og.png'), resolve(root, 'landing/og.png'))

// Capturas → WebP (mucho más livianas para la landing)
for (const file of readdirSync(resolve(root, 'docs/screenshots')).filter(f => f.endsWith('.png'))) {
  const src = 'data:image/png;base64,' + readFileSync(resolve(root, 'docs/screenshots', file)).toString('base64')
  const b64 = await page.evaluate(async src => {
    const img = new Image(); img.src = src; await img.decode()
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight
    c.getContext('2d').drawImage(img, 0, 0)
    return c.toDataURL('image/webp', 0.82).split(',')[1]
  }, src)
  writeFileSync(resolve(root, 'landing/img', file.replace('.png', '.webp')), Buffer.from(b64, 'base64'))
}
await browser.close()
console.log('listo')
