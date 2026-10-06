import { test, type Page } from '@playwright/test'

// Genera las capturas del README, la landing y el manifest. No corre en la suite normal:
//   SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
test.skip(!process.env.SCREENSHOTS, 'Solo para regenerar capturas')
test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })

const OUT = 'docs/screenshots'

async function open(page: Page, path: string, colorScheme: 'light' | 'dark') {
  await page.emulateMedia({ colorScheme, reducedMotion: 'reduce' })
  await page.goto('/?demo=1')
  await page.getByText('Estás viendo datos de ejemplo').waitFor()
  // Sin el aviso de demo ni el botón flotante encima del contenido
  await page.addStyleTag({ content: '[class*="demoBanner"]{display:none!important}' })
  if (path !== '/') await page.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name: path }).click()
  await page.waitForTimeout(500)
}

for (const scheme of ['light', 'dark'] as const) {
  test(`capturas ${scheme}`, async ({ page }) => {
    await open(page, '/', scheme)
    await page.screenshot({ path: `${OUT}/inicio-${scheme}.png` })

    await open(page, 'Cuentas', scheme)
    await page.getByText('Préstamos', { exact: true }).scrollIntoViewIfNeeded()
    await page.evaluate(() => window.scrollBy(0, -120))
    await page.screenshot({ path: `${OUT}/prestamos-${scheme}.png` })

    await page.getByRole('button', { name: /Préstamo personal Banco Nación/ }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Ver cronograma' }).click()
    await dialog.getByRole('button', { name: 'Ocultar cronograma' }).scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await page.screenshot({ path: `${OUT}/cronograma-${scheme}.png` })
    await page.keyboard.press('Escape')

    await open(page, 'Análisis', scheme)
    await page.screenshot({ path: `${OUT}/analisis-${scheme}.png` })
  })
}

test('captura de escritorio (manifest)', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await open(page, '/', 'light')
  await page.screenshot({ path: `${OUT}/escritorio.png` })
})
