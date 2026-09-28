import { expect, test } from '@playwright/test'

test('charts sit above Recent, and clicking a category bar drills into its transactions', async ({ page }) => {
  const email = `chart-drilldown${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Finance' }).click()
  await page.getByRole('button', { name: 'Accounts', exact: true }).click()
  await page.getByRole('button', { name: 'Add your first account' }).click()
  await page.fill('input[placeholder*="HDFC Bank"]', 'Wallet')
  await page.getByRole('button', { name: 'Save' }).click()

  await page.getByRole('button', { name: 'Overview', exact: true }).click()

  // Create a real category so the bar is labeled and clickable (not "Uncategorized").
  await page.getByRole('combobox', { name: 'Category' }).selectOption('__new__')
  await page.fill('input[placeholder="New category name"]', 'Groceries')
  await page.getByRole('button', { name: 'Add', exact: true }).first().click()
  await page.fill('input[placeholder="Amount"]', '450')
  await page.fill('input[placeholder="Note (optional)"]', 'Weekly shop')
  await page.getByRole('button', { name: 'Add', exact: true }).last().click()
  await expect(page.getByText('Weekly shop')).toBeVisible()

  // Charts sit above Recent now.
  const chartsY = await page.getByText('Daily spend', { exact: true }).boundingBox()
  const recentY = await page.getByText('Recent', { exact: true }).boundingBox()
  expect(chartsY).toBeTruthy()
  expect(recentY).toBeTruthy()
  expect(chartsY!.y).toBeLessThan(recentY!.y)

  // The new Income vs expense chart is also present.
  await expect(page.getByText('Income vs expense', { exact: true })).toBeVisible()

  // Clicking the category bar opens a drill-down with exactly that transaction.
  await page.locator('.recharts-bar-rectangle').first().click()
  await expect(page.getByText('Weekly shop').last()).toBeVisible()
  await expect(page.getByText(/Groceries.*2026/)).toBeVisible()

  // Closing it removes the panel.
  await page.getByRole('button', { name: 'Close' }).click()
})
