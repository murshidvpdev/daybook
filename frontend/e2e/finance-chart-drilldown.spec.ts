import { expect, test } from '@playwright/test'

test('charts sit above Recent, every chart drills into a table, and Uncategorized rows can be assigned a category inline', async ({
  page,
}) => {
  const email = `chart-drilldown${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Finance' }).click()
  await page.getByRole('button', { name: 'Accounts', exact: true }).click()
  await page.getByRole('button', { name: 'Add your first account' }).click()
  await page.fill('input[placeholder*="HDFC Bank"]', 'Wallet')
  await page.getByRole('button', { name: 'Save' }).click()

  await page.getByRole('button', { name: 'Overview', exact: true }).click()

  // A categorized expense…
  await page.getByRole('combobox', { name: 'Category' }).selectOption('__new__')
  await page.fill('input[placeholder="New category name"]', 'Groceries')
  await page.getByRole('button', { name: 'Add', exact: true }).first().click()
  await page.fill('input[placeholder="Amount"]', '450')
  await page.fill('input[placeholder="Note (optional)"]', 'Weekly shop')
  await page.getByRole('button', { name: 'Add', exact: true }).last().click()
  await expect(page.getByText('Weekly shop')).toBeVisible()

  // …and an Uncategorized one, left with "No category".
  await page.getByRole('combobox', { name: 'Category' }).selectOption('')
  await page.fill('input[placeholder="Amount"]', '120')
  await page.fill('input[placeholder="Note (optional)"]', 'Mystery spend')
  await page.getByRole('button', { name: 'Add', exact: true }).last().click()
  await expect(page.getByText('Mystery spend')).toBeVisible()

  // Charts sit above Recent.
  const chartsY = await page.getByText('Daily spend', { exact: true }).boundingBox()
  const recentY = await page.getByText('Recent', { exact: true }).boundingBox()
  expect(chartsY).toBeTruthy()
  expect(recentY).toBeTruthy()
  expect(chartsY!.y).toBeLessThan(recentY!.y)
  await expect(page.getByText('Income vs expense', { exact: true })).toBeVisible()

  // Clicking the Groceries bar in "By category" opens a real table: date,
  // note, category, account and amount columns, not a bare list.
  await page.getByTestId('chart-by-category').locator('.recharts-bar-rectangle').first().click()
  const panel = page.getByTestId('drilldown-panel')
  await expect(panel).toBeVisible()
  await expect(panel.getByRole('columnheader', { name: 'Date' })).toBeVisible()
  await expect(panel.getByRole('columnheader', { name: 'Note' })).toBeVisible()
  await expect(panel.getByRole('columnheader', { name: 'Category' })).toBeVisible()
  await expect(panel.getByRole('columnheader', { name: 'Account' })).toBeVisible()
  await expect(panel.getByRole('columnheader', { name: 'Amount' })).toBeVisible()
  await expect(panel.getByText('Weekly shop')).toBeVisible()
  await expect(panel.getByText('Wallet')).toBeVisible()
  await expect(panel.getByRole('cell').filter({ hasText: 'Groceries' })).toBeVisible()
  await expect(panel.getByText('Mystery spend')).not.toBeVisible()

  // The Income vs expense chart is clickable too, and its bucket matches the total.
  await page.getByTestId('chart-income-expense').locator('.recharts-bar-rectangle').last().click()
  await expect(panel.getByText('Weekly shop')).toBeVisible()
  await expect(panel.getByText('Mystery spend')).toBeVisible()

  // Clicking the Uncategorized bar shows the unassigned transaction, and it
  // can be given a category right there, without leaving the table.
  await page.getByTestId('chart-by-category').locator('.recharts-bar-rectangle').last().click()
  await expect(panel.getByText('Mystery spend')).toBeVisible()
  await expect(panel.getByRole('cell').filter({ hasText: 'Uncategorized' })).toBeVisible()

  await panel.getByRole('button', { name: 'Edit transaction' }).click()
  await panel.getByRole('combobox', { name: 'Category' }).selectOption({ label: 'Groceries' })
  await panel.getByRole('button', { name: 'Save' }).click()

  // Re-assigned out of Uncategorized — this filtered view now has nothing left.
  await expect(panel.getByText('No transactions match.')).toBeVisible()

  // Confirming the reassignment landed: Groceries now totals both transactions.
  await page.getByTestId('chart-by-category').locator('.recharts-bar-rectangle').first().click()
  await expect(panel.getByText('Weekly shop')).toBeVisible()
  await expect(panel.getByText('Mystery spend')).toBeVisible()

  await panel.getByRole('button', { name: 'Close' }).click()
  await expect(panel).not.toBeVisible()
})
