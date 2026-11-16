import { expect, test } from '@playwright/test'

test('the transaction list can be searched and filtered by date, type, category and account', async ({ page }) => {
  const email = `txn-filters${Date.now()}@example.com`
  const password = 'correcthorsebattery'
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  // Seed through the API — this test is about the filter bar, not the forms.
  const login = await page.request.post('/api/v1/auth/login', { data: { email, password } })
  const headers = { Authorization: `Bearer ${(await login.json()).access_token}` }
  const accountId = async (name: string) =>
    (await (await page.request.post('/api/v1/finance/accounts', { headers, data: { name } })).json()).id
  const wallet = await accountId('Wallet')
  const bank = await accountId('HDFC')
  const category = async (name: string, kind: 'expense' | 'income' = 'expense') =>
    (await (await page.request.post('/api/v1/finance/categories', { headers, data: { name, kind } })).json()).id
  const groceries = await category('Groceries')
  const fuel = await category('Fuel')
  const salary = await category('Salary', 'income')
  // Plenty of other categories, the situation that makes a plain dropdown painful.
  for (const name of ['Rent', 'Dining', 'Travel', 'Gifts', 'Health', 'Gym', 'Books', 'Phone', 'Internet', 'Pets']) {
    await category(name)
  }
  const longAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const txn = (data: Record<string, unknown>) => page.request.post('/api/v1/finance/transactions', { headers, data })
  await txn({ account_id: wallet, kind: 'expense', amount: '450', note: 'Weekly shop', category_id: groceries })
  await txn({ account_id: bank, kind: 'expense', amount: '900', note: 'Petrol fill', category_id: fuel })
  await txn({ account_id: bank, kind: 'income', amount: '50000', note: 'Payday', category_id: salary })
  await txn({
    account_id: wallet,
    kind: 'expense',
    amount: '300',
    note: 'Old veggies',
    category_id: groceries,
    occurred_on: longAgo,
  })

  await page.getByRole('link', { name: 'Finance' }).click()
  const list = page.getByTestId('transaction-list')
  await expect(list.getByText('Old veggies')).toBeVisible()
  // Each row now says which category and account it belongs to.
  await expect(list.getByText(/Fuel · HDFC/)).toBeVisible()

  // Free-text search: note…
  const search = page.getByRole('searchbox', { name: 'Search transactions' })
  await search.fill('petrol')
  await expect(list.getByText('Weekly shop')).not.toBeVisible()
  await expect(list.getByText('Petrol fill')).toBeVisible()
  await expect(page.getByText('1 transaction')).toBeVisible()
  // …category name…
  await search.fill('grocer')
  await expect(list.getByText('Petrol fill')).not.toBeVisible()
  await expect(list.getByText('Weekly shop')).toBeVisible()
  await expect(list.getByText('Old veggies')).toBeVisible()
  await expect(page.getByText('−₹750')).toBeVisible()
  // …or exact amount.
  await search.fill('450')
  await expect(list.getByText('Old veggies')).not.toBeVisible()
  await expect(list.getByText('Weekly shop')).toBeVisible()
  await search.fill('')
  await expect(list.getByText('Payday')).toBeVisible()

  // Category filter, picked by searching inside it.
  await page.getByRole('button', { name: 'Filters' }).click()
  await page.getByRole('button', { name: 'Filter by category' }).click()
  await page.getByPlaceholder('Search categories…').fill('fu')
  await expect(page.getByRole('option', { name: /Rent/ })).not.toBeVisible()
  await page.getByPlaceholder('Search categories…').press('Enter')
  await expect(list.getByText('Petrol fill')).toBeVisible()
  await expect(list.getByText('Weekly shop')).not.toBeVisible()

  // Switch to Groceries + "This month": the 45-day-old one drops out.
  await page.getByRole('button', { name: 'Filter by category' }).click()
  await page.getByRole('option', { name: /Groceries/ }).click()
  await page.getByRole('button', { name: 'This month' }).click()
  await expect(list.getByText('Weekly shop')).toBeVisible()
  await expect(list.getByText('Old veggies')).not.toBeVisible()

  // Folding the panel leaves removable chips that say what's applied.
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByRole('button', { name: 'Filters 2' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove filter Groceries' }).click()
  await expect(list.getByText('Petrol fill')).toBeVisible()
  await expect(list.getByText('Payday')).toBeVisible()
  await expect(list.getByText('Old veggies')).not.toBeVisible()

  // Type and account filters.
  await page.getByRole('button', { name: 'Filters' }).click()
  await page.getByRole('button', { name: 'Income', exact: true }).click()
  await expect(list.getByText('Payday')).toBeVisible()
  await expect(list.getByText('Petrol fill')).not.toBeVisible()
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await page.getByRole('combobox', { name: 'Filter by account' }).selectOption({ label: 'Wallet' })
  await expect(list.getByText('Weekly shop')).toBeVisible()
  await expect(list.getByText('Payday')).not.toBeVisible()

  // A search with nothing behind it says so, and "Clear all" brings the full feed back.
  await search.fill('no-such-thing')
  await expect(page.getByText('No transactions match these filters.')).toBeVisible()
  await page.getByRole('button', { name: 'Clear all' }).click()
  await expect(search).toHaveValue('')
  await expect(page.getByText('Recent', { exact: true })).toBeVisible()
  await expect(list.getByText('Old veggies')).toBeVisible()
  await expect(list.getByText('Payday')).toBeVisible()
})
