import { expect, test } from '@playwright/test'

test('importing a shared contact (.vcf) fills in name and phone', async ({ page }) => {
  const vcard = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Ummer Farook', 'TEL;TYPE=CELL:+91 98765 43210', 'END:VCARD', ''].join(
    '\r\n',
  )

  const email = `vcard-e2e${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Finance' }).click()
  await page.getByRole('button', { name: 'Lending' }).click()
  await page.getByRole('button', { name: 'Add', exact: true }).click()

  // This is the desktop-Chrome case from the report: no native picker, so the
  // vCard fallback button must be the one that renders.
  await expect(page.getByTitle('Pick from Contacts')).not.toBeVisible()

  await page
    .locator('input[type="file"]')
    .setInputFiles({ name: 'ummer-farook.vcf', mimeType: 'text/vcard', buffer: Buffer.from(vcard) })

  await expect(page.locator("input[placeholder=\"Friend's name\"]")).toHaveValue('Ummer Farook')
  await expect(page.locator('input[placeholder*="Phone number"]')).toHaveValue('+91 98765 43210')

  await page.fill('input[placeholder="Amount"]', '2000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Ummer Farook').first()).toBeVisible()

  // Reminder links should use the imported number.
  await expect(page.getByRole('link', { name: 'Remind via WhatsApp' })).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\/919876543210\?text=/,
  )
})
