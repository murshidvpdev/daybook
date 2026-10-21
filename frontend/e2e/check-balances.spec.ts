import { expect, test } from '@playwright/test'

test('check balances trues up every account and card in one save', async ({ page }) => {
  const email = `check-e2e${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Finance' }).click()
  await page.getByRole('button', { name: 'Credit Cards' }).click()
  await page.getByRole('button', { name: 'Add card' }).click()
  await page.fill('input[placeholder*="HDFC Regalia"]', 'HDFC Regalia')
  await page.fill('input[placeholder="Credit limit"]', '100000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('HDFC Regalia', { exact: true })).toBeVisible()

  // Never checked, so the Finance page nudges
  await expect(page.getByText(/never been checked/)).toBeVisible()

  await page.getByRole('button', { name: 'Check balances' }).first().click()
  // The bank app shows ₹60,000 available on a ₹1,00,000 limit — so ₹40,000 owed
  await page.getByRole('button', { name: 'Available limit' }).click()
  await page.getByLabel('HDFC Regalia available limit').fill('60000')
  await expect(page.getByText('So you owe ₹40,000.')).toBeVisible()
  await expect(page.getByText(/charges not logged/)).toBeVisible()
  await page.getByRole('button', { name: 'Save 1 account' }).click()
  await expect(page.getByText('Done — 1 checked, 1 corrected.')).toBeVisible()
  await expect(page.getByText(/Daybook owes ₹40,000 · checked today/)).toBeVisible()

  // The nudge goes away once everything's been checked
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByText(/never been checked/)).toHaveCount(0)
  await expect(page.getByText('₹40,000', { exact: true })).toBeVisible()
})
