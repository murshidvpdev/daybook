import { expect, test } from '@playwright/test'

test('card takes money in, matches a statement, and a friend spend converts to EMI', async ({ page }) => {
  const email = `card-emi-e2e${Date.now()}@example.com`
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

  // A normal spend, then one handed to a friend
  await page.getByRole('button', { name: '+ Add spend' }).click()
  await page.fill('input[placeholder="Amount"]', '2000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('₹2,000', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '+ Add spend' }).click()
  await page.fill('input[placeholder="Amount"]', '30000')
  await page.getByText('This was money I lent to a friend').click()
  await page.fill("input[placeholder=\"Friend's name\"]", 'Arjun')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('₹32,000', { exact: true })).toBeVisible()

  // Money in: a refund comes off what's owed
  await page.getByRole('button', { name: '+ Money in' }).click()
  await page.getByRole('button', { name: 'Refund / cashback' }).click()
  await page.fill('input[placeholder="Amount"]', '1000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('₹31,000', { exact: true })).toBeVisible()

  // Match statement: the bank says a bit more (unlogged interest)
  await page.getByRole('button', { name: 'Match statement' }).click()
  await page.fill('input[placeholder="Total outstanding"]', '31100')
  await expect(page.getByText('Adds a ₹100 charge')).toBeVisible()
  await page.getByRole('button', { name: 'Match', exact: true }).click()
  await expect(page.getByText('₹31,100', { exact: true })).toBeVisible()

  // Activity lists what's on the card
  await page.getByRole('button', { name: 'Activity' }).click()
  await expect(page.getByText('Matched to statement')).toBeVisible()

  // The friend asks for EMI
  await page.getByRole('button', { name: 'Lending' }).click()
  await page.getByRole('button', { name: 'Convert to EMI' }).click()
  await page.fill('input[placeholder="e.g. 5300"]', '5300')
  await expect(page.getByText('Arjun will owe ₹31,800 in total')).toBeVisible()
  await page.getByRole('button', { name: 'Convert', exact: true }).click()
  await expect(page.getByText(/On EMI · ₹5,300\/mo · 0\/6 charged/)).toBeVisible()
  await expect(page.getByText('₹31,800', { exact: true })).toBeVisible()

  // The friend's spend has left the card's current bill; the rest stays
  await page.getByRole('button', { name: 'Credit Cards' }).click()
  await expect(page.getByText('₹1,100', { exact: true })).toBeVisible()
})
