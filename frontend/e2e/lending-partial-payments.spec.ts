import { expect, test } from '@playwright/test'

test('lending supports partial repayments tracked against an account', async ({ page }) => {
  const email = `lending-partial${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Finance' }).click()

  // An account to receive the partial repayment into
  await page.getByRole('button', { name: 'Add your first account' }).click()
  await page.fill('input[placeholder*="HDFC Bank"]', 'Wallet')
  await page.fill('input[placeholder="Current balance"]', '1000')
  await page.getByRole('button', { name: 'Save' }).click()

  await page.getByRole('button', { name: 'Lending' }).click()
  await page.getByRole('button', { name: 'Add' }).click()
  await page.fill("input[placeholder=\"Friend's name\"]", 'Arjun')
  await page.fill('input[placeholder="Amount"]', '1000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Arjun')).toBeVisible()

  // Record a partial payment — not the full amount
  await page.getByRole('button', { name: 'Record payment' }).click()
  await page.getByPlaceholder('Amount').fill('400')
  await page.getByRole('combobox').selectOption({ label: 'Wallet' })
  await page.getByRole('button', { name: 'Save' }).click()

  // Still open (not fully settled), outstanding reflects the partial payment
  await expect(page.getByText('₹600 left')).toBeVisible()
  await expect(page.getByText(/₹400 · .* · via Wallet/)).toBeVisible()

  // The linked transaction actually moved the account's balance
  await page.getByRole('button', { name: 'Overview' }).click()
  await expect(page.getByText('₹1,400').first()).toBeVisible()

  // Pay off the rest — should now auto-settle
  await page.getByRole('button', { name: 'Lending' }).click()
  await page.getByRole('button', { name: 'Record payment' }).click()
  await page.getByPlaceholder('Amount').fill('600')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Settled', { exact: true })).toBeVisible()
})

test('recording a payment larger than the outstanding balance is rejected', async ({ page }) => {
  const email = `lending-overpay${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Finance' }).click()
  await page.getByRole('button', { name: 'Lending' }).click()
  await page.getByRole('button', { name: 'Add' }).click()
  await page.fill("input[placeholder=\"Friend's name\"]", 'Sara')
  await page.fill('input[placeholder="Amount"]', '200')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Sara')).toBeVisible()

  await page.getByRole('button', { name: 'Record payment' }).click()
  await page.getByPlaceholder('Amount').fill('9999')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/more than what's outstanding|Couldn't save/)).toBeVisible()
})
