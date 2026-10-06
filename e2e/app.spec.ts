import { test, expect, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const nav = (page: Page, name: string) => page.getByRole('navigation', { name: 'Principal' }).getByRole('button', { name })

test('demo: carga datos de ejemplo y el préstamo debita sus cuotas solo', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Probar con datos de ejemplo' }).click()
  await expect(page.getByText('Estás viendo datos de ejemplo')).toBeVisible()
  await expect(page.getByText('Banco Galicia').first()).toBeVisible()

  await nav(page, 'Cuentas').click()
  await expect(page.getByText('Préstamo personal Banco Nación')).toBeVisible()
  await expect(page.getByText(/Cuota \d+ de 12/)).toBeVisible()

  // El cronograma marca como debitadas las cuotas que ya vencieron
  await page.getByRole('button', { name: /Préstamo personal Banco Nación/ }).click()
  const dialog = page.getByRole('dialog', { name: 'Editar Préstamo' })
  await dialog.getByRole('button', { name: 'Ver cronograma' }).click()
  await expect(dialog.getByText(/✓/).first()).toBeVisible()
  await page.keyboard.press('Escape')

  // Borrar la demo deja la app vacía
  await nav(page, 'Inicio').click()
  await page.getByRole('button', { name: 'Borrar y empezar' }).click()
  await expect(page.getByRole('button', { name: 'Probar con datos de ejemplo' })).toBeVisible()
})

test('crear una billetera y un préstamo desde cero', async ({ page }) => {
  await page.goto('/wallets')
  await page.getByRole('button', { name: 'Nueva: Mis Billeteras' }).click()
  const wallet = page.getByRole('dialog', { name: 'Nueva Billetera' })
  await wallet.getByLabel('Nombre').fill('Banco')
  await wallet.getByLabel('Saldo Inicial').fill('500000')
  await wallet.getByRole('button', { name: 'Crear billetera' }).click()
  await expect(wallet).toBeHidden()

  await page.getByRole('button', { name: 'Nuevo: Préstamos' }).click()
  const loan = page.getByRole('dialog', { name: 'Nuevo Préstamo' })
  await loan.getByLabel('Nombre').fill('Préstamo e2e')
  await loan.getByLabel('Monto pedido').fill('600000')
  await loan.getByLabel('Cuotas', { exact: true }).fill('6')
  await loan.getByLabel('Cuota mensual').fill('120000')
  // Primer vencimiento dentro de un mes: no debe debitar nada todavía
  const due = new Date(); due.setMonth(due.getMonth() + 1)
  await loan.getByLabel('1er vencimiento').fill(due.toISOString().slice(0, 10))
  await expect(loan.getByText(/6 cuota\(s\) por pagar · Restan \$720\.000,00/)).toBeVisible()
  await loan.getByRole('button', { name: 'Agregar préstamo' }).click()
  await expect(loan).toBeHidden()

  await expect(page.getByText('Préstamo e2e')).toBeVisible()
  await expect(page.getByText('Cuota 1 de 6 · Débito desde Banco')).toBeVisible()
  // Saldo: 500.000 + 600.000 acreditados
  await expect(page.getByText('$1.100.000,00')).toBeVisible()
})

test('sin conexión: avisa y la app sigue funcionando', async ({ page, context }) => {
  await page.goto('/?demo=1')
  await expect(page.getByText('Estás viendo datos de ejemplo')).toBeVisible()
  await context.setOffline(true)
  await expect(page.getByRole('status').getByText(/Sin conexión/)).toBeVisible()
  await nav(page, 'Cuentas').click()
  await expect(page.getByText('Préstamo personal Banco Nación')).toBeVisible()
  await context.setOffline(false)
  await expect(page.getByText(/Sin conexión/)).toBeHidden()
})

test('teclado: se puede navegar y abrir una tarjeta sin mouse', async ({ page }) => {
  await page.goto('/wallets?demo=1')
  await expect(page.getByText('Visa Galicia')).toBeVisible()
  const card = page.getByRole('button', { name: /Visa Galicia/ }).first()
  await card.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(card).toBeFocused() // el foco vuelve a donde estaba
})

for (const colorScheme of ['light', 'dark'] as const) {
  test(`accesibilidad (axe, tema ${colorScheme === 'light' ? 'claro' : 'oscuro'}): sin violaciones`, async ({ page }) => {
    await page.emulateMedia({ colorScheme })
    await page.goto('/?demo=1')
    await expect(page.getByText('Estás viendo datos de ejemplo')).toBeVisible()
    for (const name of ['Inicio', 'Cuentas', 'Movimientos', 'Análisis', 'Config']) {
      await nav(page, name).click()
      await page.waitForTimeout(400) // animación de entrada
      const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze()
      expect(violations.map(v => `${name}: ${v.id} (${v.nodes.length}) ${v.help}`)).toEqual([])
    }
  })
}
