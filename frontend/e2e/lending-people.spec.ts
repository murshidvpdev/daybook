import { expect, test } from '@playwright/test'

test('people summary groups each friend, suggests past names, and links a contact to old lendings', async ({
  page,
}) => {
  const email = `people-e2e${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Finance' }).click()
  await page.getByRole('button', { name: 'Lending' }).click()

  // First time: name only (like the old history)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.fill("input[placeholder=\"Friend's name\"]", 'Shahida')
  await page.fill('input[placeholder="Amount"]', '1000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByRole('table')).toBeVisible()

  // Second time: start typing and pick her from the suggestions
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.fill("input[placeholder=\"Friend's name\"]", 'sha')
  await page.getByLabel("People you've lent to before").getByRole('button', { name: /Shahida/ }).click()
  await expect(page.locator("input[placeholder=\"Friend's name\"]")).toHaveValue('Shahida')
  await page.fill('input[placeholder="Amount"]', '500')
  await page.getByRole('button', { name: 'Save' }).click()

  // One row for her: 2 times, ₹1,500 lent and still owed
  const row = page.getByRole('row', { name: /Shahida/ })
  await expect(row).toContainText('2')
  await expect(row).toContainText('₹1,500')
  await expect(row).toContainText('no number yet')

  // Link her contact once — every old lending gets the number
  await row.click()
  await expect(page.getByText("Showing Shahida's 2 lendings")).toBeVisible()
  await page.getByRole('button', { name: 'Link contact' }).click()
  const vcard = ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Shahida K', 'TEL;TYPE=CELL:+91 90000 11111', 'END:VCARD', ''].join(
    '\r\n',
  )
  await page
    .locator('input[type="file"]')
    .last()
    .setInputFiles({ name: 'shahida.vcf', mimeType: 'text/vcard', buffer: Buffer.from(vcard) })
  await page.getByRole('button', { name: 'Save for all' }).click()

  const linked = page.getByRole('row', { name: /Shahida K/ })
  await expect(linked).toContainText('+91 90000 11111')
  await expect(linked).toContainText('2')
  // Reminders on each old lending now use her number
  await expect(page.getByRole('link', { name: 'Remind via WhatsApp' }).first()).toHaveAttribute(
    'href',
    /^https:\/\/wa\.me\/919000011111\?text=/,
  )
})

test('reminders ask only for what is still left, per lending and per person', async ({ page }) => {
  const email = `remind-e2e${Date.now()}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })

  await page.getByRole('link', { name: 'Finance' }).click()
  await page.getByRole('button', { name: 'Lending' }).click()
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.fill("input[placeholder=\"Friend's name\"]", 'Arjun')
  await page.fill('input[placeholder*="Phone number"]', '98765 43210')
  await page.fill('input[placeholder="Amount"]', '5000')
  await page.getByRole('button', { name: 'Save' }).click()

  // He pays back 2,000 of it
  await page.getByRole('button', { name: 'Record payment' }).click()
  await page.locator('input[type="number"]').last().fill('2000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('₹3,000 left')).toBeVisible()

  const lendingLink = page.getByRole('link', { name: 'Remind via WhatsApp' })
  await expect(lendingLink).toHaveAttribute('href', /^https:\/\/wa\.me\/919876543210\?text=.*%E2%82%B93%2C000%20is%20still%20pending/)

  await page.getByRole('row', { name: /Arjun/ }).click()
  await expect(page.getByRole('link', { name: 'Remind ₹3,000 on WhatsApp' })).toHaveAttribute(
    'href',
    /%E2%82%B93%2C000%20is%20still%20pending/,
  )
})
