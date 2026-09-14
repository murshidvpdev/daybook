import { expect, test } from '@playwright/test'

test('adjusting an account balance reflects instantly in both the account row and total balance', async ({
  page,
}) => {
  const email = `balance-adjust${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Finance' }).click()
  await page.getByRole('button', { name: 'Add your first account' }).click()
  await page.fill('input[placeholder*="HDFC Bank"]', 'Wallet')
  await page.fill('input[placeholder="Current balance"]', '1000')
  await page.getByRole('button', { name: 'Save' }).click()

  // Total balance tile should show the opening balance right away
  await expect(page.getByText('Total balance')).toBeVisible()
  await expect(page.getByText('₹1,000').first()).toBeVisible()

  // Tap the balance figure to correct it — this is the "manual updation" flow
  await page.getByTitle('Not right? Tap to set the actual balance').click()
  await page.getByTestId('adjust-balance-amount').fill('1500')
  await page.getByRole('button', { name: 'Save' }).click()

  // Both the account row and the Total balance summary tile update together
  await expect(page.getByText('₹1,500').first()).toBeVisible()
  await expect(page.getByText('₹1,000')).not.toBeVisible()

  // The adjustment is logged as a real, auditable transaction
  await expect(page.getByText('Balance adjustment')).toBeVisible()
})

test('deleting a transaction removes it immediately without a full reload', async ({ page }) => {
  const email = `balance-delete${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Finance' }).click()
  await page.getByRole('button', { name: 'Add your first account' }).click()
  await page.fill('input[placeholder*="HDFC Bank"]', 'Wallet')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.fill('input[placeholder="Amount"]', '200')
  await page.fill('input[placeholder="Note (optional)"]', 'Coffee')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Coffee')).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete transaction', exact: true }).click()
  // No reliance on a network round trip finishing — the row should be gone
  // immediately (optimistic removal), well under the default assertion timeout.
  await expect(page.getByText('Coffee')).not.toBeVisible({ timeout: 1000 })
})
