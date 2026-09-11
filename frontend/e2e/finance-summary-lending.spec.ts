import { expect, test } from '@playwright/test'

test('summary shows lending stats and backs lending out of "spent, excl. lending"', async ({ page }) => {
  const email = `summary-lending${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Finance' }).click()
  await page.getByRole('button', { name: 'Add your first account' }).click()
  await page.fill('input[placeholder*="HDFC Bank"]', 'Wallet')
  await page.fill('input[placeholder="Current balance"]', '10000')
  await page.getByRole('button', { name: 'Save' }).click()

  // A plain expense.
  await page.fill('input[placeholder="Amount"]', '500')
  await page.fill('input[placeholder="Note (optional)"]', 'Groceries')
  await page.getByRole('button', { name: 'Add', exact: true }).click()

  // Lending, funded from the same account.
  await page.getByRole('button', { name: 'Lending' }).click()
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.fill("input[placeholder=\"Friend's name\"]", 'Arjun')
  await page.fill('input[placeholder="Amount"]', '2000')
  await page.getByLabel(/Paid from/).selectOption({ label: 'Wallet' })
  await page.getByRole('button', { name: 'Save' }).click()

  await page.getByRole('button', { name: 'Overview' }).click()
  await expect(page.getByText('Spent this month')).toBeVisible()
  await expect(page.getByText('₹2,500').first()).toBeVisible() // all-inclusive: 500 + 2000
  await expect(page.getByText('Spent, excl. lending')).toBeVisible()
  await expect(page.getByText('₹500', { exact: true }).first()).toBeVisible() // true spend, lending backed out
  await expect(page.getByText('Lent out, unpaid')).toBeVisible()
  await expect(page.getByText('₹2,000').first()).toBeVisible()
})
