import { expect, test } from '@playwright/test'

test('completing a routine item shows and allows correcting the time', async ({ page }) => {
  const email = `routine-time${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Routine' }).click()
  await page.getByRole('button', { name: 'New' }).click()
  await page.fill('input[placeholder*="Morning routine"]', 'Morning')
  await page.fill('input[placeholder="Item 1"]', 'Meditate')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Meditate')).toBeVisible()

  // Marking it done shows a time next to it (some time in AM/PM form).
  await page.getByText('Meditate').click()
  const timeButton = page.getByTitle('Not when it actually happened? Tap to correct the time')
  await expect(timeButton).toBeVisible()
  await expect(timeButton).toHaveText(/\d{1,2}:\d{2} (AM|PM)/)

  // Correct it to a specific time, logged well after the fact (the whole point).
  await timeButton.click()
  await page.locator('input[type="time"]').fill('07:30')
  await expect(page.getByText('7:30 AM')).toBeVisible()
})
