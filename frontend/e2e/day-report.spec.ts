import { expect, test } from '@playwright/test'

test('day report card shows a live preview and downloads a real PDF', async ({ page }) => {
  const email = `day-report${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  await expect(page.getByText('Day report')).toBeVisible()
  // Fresh account, today's date selected by default — nothing logged yet.
  await expect(page.getByText(/Nothing logged on/)).toBeVisible()

  // Log something today so the preview has content to show.
  await page.getByRole('link', { name: 'Habits' }).click()
  await page.fill('input[placeholder*="New habit"]', 'Read')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText('Read')).toBeVisible()
  await page.locator('button.rounded-full').click() // the habit's completion toggle circle

  await page.getByRole('link', { name: 'Today', exact: true }).click()
  await expect(page.getByText(/habits/)).toBeVisible({ timeout: 10_000 })

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download PDF' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^daybook-\d{4}-\d{2}-\d{2}\.pdf$/)

  const path = await download.path()
  expect(path).toBeTruthy()
})
