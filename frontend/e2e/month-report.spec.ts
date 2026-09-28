import { expect, test } from '@playwright/test'

test('month and all-time report tabs show a summary and download PDFs', async ({ page }) => {
  const email = `month-report${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  // Log a habit today so this month's summary has something to show.
  await page.getByRole('link', { name: 'Habits' }).click()
  await page.fill('input[placeholder*="New habit"]', 'Read')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText('Read')).toBeVisible()
  await page.locator('button.rounded-full').click()

  await page.getByRole('link', { name: 'Today', exact: true }).click()
  await expect(page.getByText('Reports')).toBeVisible()

  // Switch to the Month tab — current month should already show the habit.
  await page.getByRole('button', { name: 'month', exact: true }).click()
  await expect(page.getByText(/1 habits/)).toBeVisible({ timeout: 10_000 })

  // Navigating to the previous month shows nothing logged there.
  await page.getByLabel('Previous month').click()
  await expect(page.getByText(/Nothing logged in this period/)).toBeVisible()

  // Back to the current month, then download its PDF.
  await page.getByLabel('Next month').click()
  const monthDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF' }).click()
  const monthFile = await monthDownload
  expect(monthFile.suggestedFilename()).toMatch(/^daybook-\d{4}-\d{2}\.pdf$/)

  // All-time tab.
  await page.getByRole('button', { name: 'All time' }).click()
  await expect(page.getByText(/1 habits/)).toBeVisible({ timeout: 10_000 })
  const allDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF' }).click()
  const allFile = await allDownload
  expect(allFile.suggestedFilename()).toBe('daybook-all-time.pdf')
})
