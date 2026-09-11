import { expect, test } from '@playwright/test'

test('card spend can auto-create a lending record, and bills generate/pay', async ({ page }) => {
  const email = `billing-e2e${Date.now()}@example.com`
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

  // Quick spend, marked as lent to a friend
  await page.getByRole('button', { name: '+ Add spend' }).click()
  await page.fill('input[placeholder="Amount"]', '2000')
  await page.fill('input[placeholder*="Groceries"]', 'Cash for Arjun')
  await page.getByText('This was money I lent to a friend').click()
  await page.fill("input[placeholder=\"Friend's name\"]", 'Arjun')
  await page.getByRole('button', { name: 'Save' }).click()

  // Card balance reflects the spend
  await expect(page.getByText('₹2,000')).toBeVisible()

  // It shows up automatically in Lending — the whole point of the feature
  await page.getByRole('button', { name: 'Lending' }).click()
  await expect(page.getByText('Arjun').first()).toBeVisible()
  await expect(page.getByText('from a card spend')).toBeVisible()

  // Plain spend (no lending) still works and doesn't create a lending row
  await page.getByRole('button', { name: 'Credit Cards' }).click()
  await page.getByRole('button', { name: '+ Add spend' }).click()
  await page.fill('input[placeholder="Amount"]', '500')
  await page.fill('input[placeholder*="Groceries"]', 'Groceries')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('₹2,500')).toBeVisible()

  // Bill generation
  await page.getByRole('button', { name: 'Bills' }).click()
  await page.getByRole('button', { name: 'Generate bill' }).click()
  await expect(page.getByText('₹2,500', { exact: true }).last()).toBeVisible()
  await page.getByRole('button', { name: 'Mark paid' }).click()
  await expect(page.getByText('Paid', { exact: true })).toBeVisible()

  // Paying the bill brings the outstanding balance back to zero
  await expect(page.getByText('₹0', { exact: true })).toBeVisible()
})

test('accounts show a running balance from an opening balance', async ({ page }) => {
  const email = `balance-e2e${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Finance' }).click()
  await page.getByRole('button', { name: 'Add your first account' }).click()
  await page.fill('input[placeholder*="HDFC Bank"]', 'HDFC Bank')
  await page.fill('input[placeholder="Current balance"]', '45000')
  await page.getByRole('button', { name: 'Save' }).click()

  await expect(page.getByText('₹45,000').first()).toBeVisible()

  await page.fill('input[placeholder="Amount"]', '1000')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('₹44,000').first()).toBeVisible()
})
