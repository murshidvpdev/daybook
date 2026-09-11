import { expect, test } from '@playwright/test'

/**
 * One golden-path smoke test across every MVP domain: register, then create
 * one item in each of routine/habits/finance/fitness, and confirm the
 * dashboard aggregates all of them correctly. Requires the API on :8000
 * (proxied by Vite) — see backend/README or the repo root README.
 */
test('register, log across every domain, dashboard reflects it', async ({ page }) => {
  const email = `smoke${Date.now()}@example.com`

  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  // Routine
  await page.getByRole('link', { name: 'Routine' }).click()
  await page.getByRole('button', { name: 'New' }).click()
  await page.fill('input[placeholder*="Routine name"]', 'Morning routine')
  await page.fill('input[placeholder="Item 1"]', 'Meditate')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByText('Meditate').click()
  await expect(page.getByText('Meditate')).toHaveClass(/line-through/)

  // Habits
  await page.getByRole('link', { name: 'Habits' }).click()
  await page.fill('input[placeholder*="New habit"]', 'Read')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText('Read')).toBeVisible()

  // Finance — a fresh user always lands on the "add your first account" prompt
  await page.getByRole('link', { name: 'Finance' }).click()
  await page.getByRole('button', { name: 'Add your first account' }).click()
  await page.fill('input[placeholder*="HDFC Bank"]', 'Wallet')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.fill('input[placeholder="Amount"]', '450')
  await page.fill('input[placeholder="Note (optional)"]', 'Lunch')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Lunch')).toBeVisible()

  // Fitness
  await page.getByRole('link', { name: 'Fitness' }).click()
  await page.fill('input[placeholder*="Bench Press"]', 'Bench Press')
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByText('No sets logged yet.')).toBeVisible()
  await page.selectOption('select', { label: 'Bench Press' })
  await page.fill('input[placeholder="reps"]', '8')
  await page.fill('input[placeholder="kg"]', '60')
  await page.getByRole('button', { name: 'Add set' }).click()
  await expect(page.getByText(/Bench Press.*8 reps/)).toBeVisible()

  // Dashboard reflects every domain
  await page.getByRole('link', { name: 'Today' }).click()
  await expect(page.getByText('1/1').first()).toBeVisible()
  await expect(page.getByText('₹450')).toBeVisible()
  await expect(page.getByText('Logged')).toBeVisible()
})

test('bottom nav renders correctly at iPhone width', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const email = `smoke${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  const bottomNav = page.locator('nav.fixed')
  await expect(bottomNav).toBeVisible()
  await expect(bottomNav.getByRole('link', { name: 'Finance' })).toBeVisible()
})
