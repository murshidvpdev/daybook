import { expect, test } from '@playwright/test'

test('monthly summary shows salary as income, keeps borrowed money out of it, and computes savings', async ({
  page,
}) => {
  const email = `monthly-cashflow${Date.now()}@example.com`
  const password = 'correcthorsebattery'
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  // Seed straight through the API — the point here is the summary card, not the forms.
  const login = await page.request.post('/api/v1/auth/login', { data: { email, password } })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  const account = await page.request.post('/api/v1/finance/accounts', {
    headers,
    data: { name: 'HDFC Bank', account_type: 'bank', opening_balance: '0' },
  })
  const accountId = (await account.json()).id
  await page.request.post('/api/v1/finance/transactions', {
    headers,
    data: { account_id: accountId, kind: 'income', amount: '50000', note: 'Salary' },
  })
  await page.request.post('/api/v1/finance/transactions', {
    headers,
    data: { account_id: accountId, kind: 'expense', amount: '20000', note: 'Rent' },
  })
  await page.request.post('/api/v1/finance/lendings', {
    headers,
    data: { person_name: 'Rahul', direction: 'borrowed', amount: '5000', account_id: accountId },
  })

  await page.getByRole('link', { name: 'Finance' }).click()
  const card = page.getByTestId('monthly-cashflow')
  await card.scrollIntoViewIfNeeded()
  await expect(card.getByText('₹50,000')).toBeVisible()
  await expect(card.getByText('₹20,000')).toBeVisible()
  await expect(card.getByText('₹30,000')).toBeVisible()
  await expect(card.getByText('60% of income')).toBeVisible()
  await expect(card.getByText('+₹5,000')).toBeVisible()
  await expect(card.getByText('Not counted as income')).toBeVisible()
})
