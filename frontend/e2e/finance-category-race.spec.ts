import { expect, test } from '@playwright/test'

test('submitting right after creating a new category still assigns it, even on a slow network', async ({
  page,
}) => {
  // Artificially delay category creation so it resolves well after the user
  // would already have clicked "Add" — this is exactly the race that used to
  // silently drop the category and leave the transaction Uncategorized.
  await page.route('**/finance/categories', async (route) => {
    if (route.request().method() === 'POST') {
      await new Promise((r) => setTimeout(r, 800))
    }
    await route.continue()
  })

  const email = `category-race${Date.now()}@example.com`
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

  await page.getByRole('combobox', { name: 'Category' }).selectOption('__new__')
  await page.fill('input[placeholder="New category name"]', 'Groceries')
  await page.getByRole('button', { name: 'Add', exact: true }).first().click()

  // Fill the rest and hit the main Add immediately — before the delayed
  // category-creation request has resolved. The button must refuse to
  // submit until the category actually lands.
  await page.fill('input[placeholder="Amount"]', '300')
  await page.fill('input[placeholder="Note (optional)"]', 'Fast checkout')
  const addButton = page.getByRole('button', { name: 'Add', exact: true }).last()
  await expect(addButton).toBeDisabled()
  await addButton.click({ force: true }) // even if clicked, disabled buttons don't submit

  // Once the category creation resolves, the button re-enables and a real
  // click submits — with the category correctly attached.
  await expect(addButton).toBeEnabled({ timeout: 5_000 })
  await addButton.click()
  await expect(page.getByText('Fast checkout')).toBeVisible()

  await page.waitForTimeout(500)
  await page.reload()
  // A reload re-fetches everything from scratch (auth, all Finance queries) —
  // on a slower CI runner that can genuinely take longer than the default
  // 5s expect timeout, same as any other post-navigation assertion here.
  await expect(page.getByText('Fast checkout')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('chart-by-category')).toContainText('Groceries')
  await expect(page.getByTestId('chart-by-category')).not.toContainText('Uncategorized')
})
