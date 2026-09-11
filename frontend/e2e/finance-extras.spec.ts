import { expect, test } from '@playwright/test'

test('credit cards, EMIs, SIPs, and lending all work end to end', async ({ page }) => {
  const email = `finance-e2e${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Finance' }).click()

  // Credit cards
  await page.getByRole('button', { name: 'Credit Cards' }).click()
  await page.getByRole('button', { name: 'Add card' }).click()
  await page.fill('input[placeholder*="HDFC Regalia"]', 'HDFC Regalia')
  await page.fill('input[placeholder="Last 4 digits"]', '4242')
  await page.fill('input[placeholder="Credit limit"]', '150000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('HDFC Regalia')).toBeVisible()
  await expect(page.getByText('•••• 4242')).toBeVisible()

  // EMI against that card
  await page.getByRole('button', { name: 'EMIs' }).click()
  await page.getByRole('button', { name: 'Add EMI' }).click()
  await page.fill('input[placeholder*="iPhone 15"]', 'iPhone EMI')
  await page.fill('input[placeholder="₹/month"]', '3500')
  await page.fill('input[placeholder="Months"]', '10')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('iPhone EMI')).toBeVisible()
  await expect(page.getByText(/\d+\/10 paid/)).toBeVisible()

  // Give the SIP a real bank account to debit from (a credit card already
  // counts as "an account" for the tab's own empty-state check, so add one
  // explicitly rather than relying on that gate).
  await page.getByRole('button', { name: 'Overview' }).click()
  await page.getByRole('button', { name: 'Add account' }).click()
  await page.fill('input[placeholder*="HDFC Bank"]', 'HDFC Bank')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'SIPs' }).click()
  await page.getByRole('button', { name: 'Add SIP' }).click()
  await page.fill('input[placeholder*="Nifty 50"]', 'Nifty 50 Index Fund')
  await page.fill('input[placeholder="₹/month"]', '5000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Nifty 50 Index Fund')).toBeVisible()

  // Lending with a phone number -> reminder links appear
  await page.getByRole('button', { name: 'Lending' }).click()
  await page.getByRole('button', { name: 'Add' }).click()
  await page.fill("input[placeholder=\"Friend's name\"]", 'Arjun')
  await page.fill('input[placeholder*="Phone number"]', '+91 98765 43210')
  await page.fill('input[placeholder="Amount"]', '2000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Arjun')).toBeVisible()
  const whatsappLink = page.getByRole('link', { name: 'Remind via WhatsApp' })
  await expect(whatsappLink).toBeVisible()
  await expect(whatsappLink).toHaveAttribute('href', /^https:\/\/wa\.me\/919876543210\?text=/)

  await page.getByRole('button', { name: 'Mark settled' }).click()
  await expect(page.getByText('Settled', { exact: true })).toBeVisible()
})
