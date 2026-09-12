import { expect, test } from '@playwright/test'

test('a credit card shows up in Overview, is selectable for a plain expense, and links back to its tab', async ({
  page,
}) => {
  const email = `overview-cards${Date.now()}@example.com`
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
  await expect(page.getByText('HDFC Regalia')).toBeVisible()

  // The card shows up on Overview too, not just its own tab
  await page.getByRole('button', { name: 'Overview' }).click()
  await expect(page.getByText('HDFC Regalia')).toBeVisible()
  await expect(page.getByText('View card →')).toBeVisible()

  // It's selectable in the plain quick-add form — no need to go to the card's own "+ Add spend"
  await page.getByRole('button', { name: 'Add account' }).click()
  await page.fill('input[placeholder*="HDFC Bank"]', 'Wallet')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('combobox', { name: 'Account' }).selectOption({ label: 'HDFC Regalia' })
  await page.fill('input[placeholder="Amount"]', '800')
  await page.fill('input[placeholder="Note (optional)"]', 'Dinner on the card')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Dinner on the card')).toBeVisible()

  // Card balance reflects it, confirming the transaction actually landed on the card's account
  await expect(page.getByText('₹800').first()).toBeVisible()

  // Clicking through actually switches to the Credit Cards tab
  await page.getByText('View card →').click()
  await expect(page.getByRole('button', { name: 'Bills' })).toBeVisible()
})
