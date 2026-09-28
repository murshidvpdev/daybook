import { expect, test } from '@playwright/test'

test('accounts live on their own tab, and Overview shows the monthly charts above Recent', async ({ page }) => {
  const email = `finance-layout${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Finance' }).click()

  // Overview has no account-management UI at all
  await expect(page.getByRole('button', { name: 'Add your first account' })).not.toBeVisible()

  await page.getByRole('button', { name: 'Accounts', exact: true }).click()
  await page.getByRole('button', { name: 'Add your first account' }).click()
  await page.fill('input[placeholder*="HDFC Bank"]', 'Wallet')
  await page.fill('input[placeholder="Current balance"]', '2000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Wallet')).toBeVisible()
  await expect(page.getByText('₹2,000').first()).toBeVisible()

  // Log a categorized expense from Overview, then confirm layout order:
  // the monthly charts sit above Recent (the list), not below it.
  await page.getByRole('button', { name: 'Overview', exact: true }).click()
  await page.fill('input[placeholder="Amount"]', '350')
  await page.fill('input[placeholder="Note (optional)"]', 'Groceries')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Groceries')).toBeVisible()

  const recentY = await page.getByText('Recent', { exact: true }).boundingBox()
  const chartY = await page.getByText('Daily spend', { exact: true }).boundingBox()
  expect(recentY).toBeTruthy()
  expect(chartY).toBeTruthy()
  expect(chartY!.y).toBeLessThan(recentY!.y)

  // The category chart reflects this month's spend, with a month picker
  // that can flip to a quiet month and back.
  await expect(page.getByText('By category', { exact: true })).toBeVisible()
  await page.getByLabel('Previous month').click()
  await expect(page.getByText('No spending logged this month.').first()).toBeVisible()
  await page.getByLabel('Next month').click()
  await expect(page.getByText('No spending logged this month.')).not.toBeVisible()
})
