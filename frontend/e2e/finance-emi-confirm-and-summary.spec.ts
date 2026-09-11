import { expect, test } from '@playwright/test'

test('EMI due date asks for confirmation before charging, and the dashboard/summary reflect it', async ({
  page,
}) => {
  const email = `emi-confirm${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Finance' }).click()
  await page.getByRole('button', { name: 'Credit Cards' }).click()
  await page.getByRole('button', { name: 'Add card' }).click()
  await page.fill('input[placeholder*="HDFC Regalia"]', 'HDFC Regalia')
  await page.getByRole('button', { name: 'Save' }).click()

  await page.getByRole('button', { name: 'EMIs' }).click()
  await page.getByRole('button', { name: 'Add EMI' }).click()
  await page.fill('input[placeholder*="iPhone 15"]', 'iPhone EMI')
  await page.fill('input[placeholder="₹/month"]', '3500')
  await page.fill('input[placeholder="Months"]', '10')
  await page.getByRole('button', { name: 'Save' }).click()

  // Not due yet (default due date is in the future) — no confirm prompt, no charge.
  await expect(page.getByText('0/10 paid')).toBeVisible()
  await expect(page.getByText('Yes, paid')).not.toBeVisible()

  // Dashboard shouldn't nag about an EMI that isn't due.
  await page.getByRole('link', { name: 'Today' }).click()
  await expect(page.getByText('have you paid this?')).not.toBeVisible()

  await page.getByRole('link', { name: 'Finance' }).click()
  await page.getByRole('button', { name: 'EMIs' }).click()
  await expect(page.getByText('0/10 paid')).toBeVisible()
})

test('finance summary panel shows total balance, debt, and top spend account', async ({ page }) => {
  const email = `summary${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Finance' }).click()
  await page.getByRole('button', { name: 'Add your first account' }).click()
  await page.fill('input[placeholder*="HDFC Bank"]', 'HDFC Bank')
  await page.fill('input[placeholder="Current balance"]', '50000')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('Total balance')).toBeVisible()
  await expect(page.getByText('₹50,000').first()).toBeVisible()

  await page.fill('input[placeholder="Amount"]', '3000')
  await page.fill('input[placeholder="Note (optional)"]', 'Rent')
  await page.getByRole('button', { name: 'Add', exact: true }).click()

  await expect(page.getByText('₹47,000').first()).toBeVisible() // total balance updated
  await expect(page.getByText('Spent this month')).toBeVisible()
  await expect(page.getByText('Most spent from')).toBeVisible()
  await expect(page.getByText('HDFC Bank').first()).toBeVisible()
})
