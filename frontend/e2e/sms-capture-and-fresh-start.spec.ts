import { expect, test } from '@playwright/test'

test('bank SMS are captured, reviewed and booked; start fresh keeps lendings', async ({ page }) => {
  const email = `sms-e2e${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Finance' }).click()

  // A bank account with its last 4 digits, and a card
  await page.getByRole('button', { name: 'Accounts' }).click()
  await page.getByRole('button', { name: /Add/ }).first().click()
  await page.fill('input[placeholder*="Account name"]', 'Federal Bank')
  await page.locator('select').first().selectOption('bank')
  await page.fill('input[placeholder="Current balance"]', '15000')
  await page.getByLabel('Last 4 digits of the account number').fill('7762')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Federal Bank', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Credit Cards' }).click()
  await page.getByRole('button', { name: 'Add card' }).click()
  await page.fill('input[placeholder*="HDFC Regalia"]', 'Axis Card')
  await page.fill('input[placeholder="Last 4 digits"]', '3973')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/Axis Card/).first()).toBeVisible()

  // Turn on SMS tracking and read the one-time key off the screen
  await page.getByRole('button', { name: 'Settings' }).click()
  await page.getByRole('button', { name: 'Turn on SMS tracking' }).click()
  const key = (await page.locator('code').nth(1).textContent())!.trim()
  const url = (await page.locator('code').nth(0).textContent())!.trim()
  expect(url).toMatch(/\/api\/v1\/capture\/sms$/)

  // What the phone automation would send
  for (const text of [
    'Debited Rs 160.00 from a/c X7762 on 19Oct26 20:29 via UPI to SIDDIQ KABAB. Ref 317269047788.Bal Rs 14481.17. Not you?Call 18004251199 -Federal Bank',
    'Spent INR 2000\nusing Axis Bank Credit Card no. XX3973 on 20-10-26 16:37:34 IST at\nRamachandra.\nAvl limit: INR 81616.93.',
  ]) {
    const resp = await page.request.post('/api/v1/capture/sms', { headers: { 'X-Daybook-Key': key }, data: { text } })
    expect((await resp.json()).status).toBe('captured')
  }

  await page.reload()
  await page.getByRole('link', { name: 'Finance' }).click()
  await page.getByRole('button', { name: /2 SMS to review/ }).click()

  // Federal: matched to the account from "X7762" — plain spending
  const kabab = page.locator('div.rounded-lg', { hasText: 'SIDDIQ KABAB' }).last()
  await expect(kabab.getByLabel('Account')).toHaveValue(/.+/)
  await kabab.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/Ref 317269047788/)).toHaveCount(0) // gone from the review list

  // Axis card: money handed to a friend
  const axis = page.locator('div.rounded-lg', { hasText: 'Ramachandra' }).last()
  await axis.getByRole('button', { name: 'Lent to a friend' }).click()
  await axis.getByPlaceholder("Friend's name").fill('Arjun')
  await axis.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('All caught up — nothing waiting.')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()

  await page.getByRole('button', { name: 'Accounts' }).click()
  await expect(page.getByText('₹14,840', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Lending' }).click()
  await expect(page.getByText(/^Arjun/)).toBeVisible()

  // Start fresh: backup first, then wipe — the lending survives
  await page.getByRole('button', { name: 'Settings' }).click()
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: /Download backup/ }).click()
  expect((await download).suggestedFilename()).toMatch(/^daybook-backup-\d{4}-\d{2}-\d{2}\.json$/)
  await page.getByPlaceholder('START FRESH').fill('START FRESH')
  await page.getByRole('button', { name: '3. Start fresh' }).click()
  await expect(page.getByText(/Done\. Now add your bank accounts/)).toBeVisible()

  await page.getByRole('button', { name: 'Accounts' }).click()
  await expect(page.getByText('Federal Bank', { exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Lending' }).click()
  await expect(page.getByText(/^Arjun/)).toBeVisible()
})
