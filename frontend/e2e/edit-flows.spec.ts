import { expect, test } from '@playwright/test'

async function registerAndLogin(page: import('@playwright/test').Page) {
  const email = `edit-flows${Date.now()}${Math.random().toString(36).slice(2)}@example.com`
  await page.goto('/register')
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', 'correcthorsebattery')
  await page.click('button[type="submit"]')
  await expect(page.getByText('Good day,')).toBeVisible({ timeout: 15_000 })
}

test('editing a routine, an item, and deleting an item all persist', async ({ page }) => {
  await registerAndLogin(page)

  await page.getByRole('link', { name: 'Routine' }).click()
  await page.getByRole('button', { name: 'New' }).click()
  await page.fill('input[placeholder*="Routine name"]', 'Morning routine')
  await page.fill('input[placeholder="Item 1"]', 'Meditate')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Meditate')).toBeVisible()

  // Rename the routine itself
  await page.getByRole('button', { name: 'Edit routine', exact: true }).click()
  await page.getByTestId('edit-routine-name').fill('Evening routine')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Evening routine')).toBeVisible()

  // Add a second item, then rename it
  await page.getByRole('button', { name: 'Add item' }).click()
  await page.fill('input[placeholder="New item"]', 'Stretch')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Stretch')).toBeVisible()

  await page.getByRole('button', { name: 'Edit item', exact: true }).nth(1).click()
  await page.getByTestId('edit-item-title').fill('Deep breathing')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Deep breathing')).toBeVisible()

  // Delete the second item
  await page.getByRole('button', { name: 'Delete item', exact: true }).last().click()
  await expect(page.getByText('Deep breathing')).not.toBeVisible()
  await expect(page.getByText('Meditate')).toBeVisible()
})

test('editing and archiving a habit works', async ({ page }) => {
  await registerAndLogin(page)

  await page.getByRole('link', { name: 'Habits' }).click()
  await page.fill('input[placeholder*="New habit"]', 'Read')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByText('Read')).toBeVisible()

  await page.getByRole('button', { name: 'Edit habit', exact: true }).click()
  await page.getByTestId('edit-habit-name').fill('Read fiction')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Read fiction')).toBeVisible()

  await page.getByRole('button', { name: 'Archive habit', exact: true }).click()
  await expect(page.getByText('Read fiction')).not.toBeVisible()

  await page.getByRole('button', { name: 'Show archived' }).click()
  await expect(page.getByText('Read fiction')).toBeVisible()
  await expect(page.getByText('archived', { exact: true })).toBeVisible()

  await page.getByRole('button', { name: 'Unarchive' }).click()
  await page.getByRole('button', { name: 'Hide archived' }).click()
  await expect(page.getByText('Read fiction')).toBeVisible()
})

test('editing an account and a transaction persists the new values', async ({ page }) => {
  await registerAndLogin(page)

  await page.getByRole('link', { name: 'Finance' }).click()
  await page.getByRole('button', { name: 'Add your first account' }).click()
  await page.fill('input[placeholder*="HDFC Bank"]', 'Wallet')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.fill('input[placeholder="Amount"]', '450')
  await page.fill('input[placeholder="Note (optional)"]', 'Lunch')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Lunch')).toBeVisible()

  // Edit the account name
  await page.getByRole('button', { name: 'Edit account', exact: true }).click()
  await page.getByTestId('edit-account-name').fill('Main Wallet')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Main Wallet').first()).toBeVisible()

  // Edit the transaction note and amount
  await page.getByRole('button', { name: 'Edit transaction', exact: true }).click()
  await page.getByTestId('edit-txn-note').fill('Dinner')
  await page.getByTestId('edit-txn-amount').fill('600')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Dinner')).toBeVisible()
  await expect(page.getByText('−₹600').first()).toBeVisible()

  // Delete the transaction
  page.once('dialog', (dialog) => dialog.accept())
  await page.getByRole('button', { name: 'Delete transaction', exact: true }).click()
  await expect(page.getByText('No transactions yet.')).toBeVisible()
})

test('editing a credit card, EMI, SIP, and lending record all persist', async ({ page }) => {
  await registerAndLogin(page)
  await page.getByRole('link', { name: 'Finance' }).click()

  // Credit card
  await page.getByRole('button', { name: 'Credit Cards' }).click()
  await page.getByRole('button', { name: 'Add card' }).click()
  await page.fill('input[placeholder*="HDFC Regalia"]', 'HDFC Regalia')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('HDFC Regalia')).toBeVisible()

  await page.getByRole('button', { name: 'Edit card', exact: true }).click()
  await page.getByTestId('edit-card-name').fill('ICICI Amazon Pay')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('ICICI Amazon Pay')).toBeVisible()

  // EMI
  await page.getByRole('button', { name: 'EMIs' }).click()
  await page.getByRole('button', { name: 'Add EMI' }).click()
  await page.fill('input[placeholder*="iPhone"]', 'iPhone EMI')
  await page.fill('input[placeholder="₹/month"]', '3500')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('iPhone EMI')).toBeVisible()

  await page.getByRole('button', { name: 'Edit EMI', exact: true }).click()
  await page.getByTestId('edit-emi-name').fill('Laptop EMI')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Laptop EMI')).toBeVisible()

  // SIP
  await page.getByRole('button', { name: 'SIPs' }).click()
  await page.getByRole('button', { name: 'Add SIP' }).click()
  await page.fill('input[placeholder*="Nifty"]', 'Nifty 50 Index Fund')
  await page.fill('input[placeholder="₹/month"]', '5000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Nifty 50 Index Fund')).toBeVisible()

  await page.getByRole('button', { name: 'Edit SIP', exact: true }).click()
  await page.getByTestId('edit-sip-name').fill('Sensex Index Fund')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Sensex Index Fund')).toBeVisible()

  // Lending
  await page.getByRole('button', { name: 'Lending' }).click()
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.fill('input[placeholder="Friend\'s name"]', 'Arjun')
  await page.fill('input[placeholder="Amount"]', '2000')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Arjun')).toBeVisible()

  await page.getByRole('button', { name: 'Edit lending', exact: true }).click()
  await page.getByTestId('edit-lending-name').fill('Arjun Kumar')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Arjun Kumar')).toBeVisible()
})

test('editing an exercise, a session, and a set all persist', async ({ page }) => {
  await registerAndLogin(page)

  await page.getByRole('link', { name: 'Fitness' }).click()
  await page.fill('input[placeholder*="Bench Press"]', 'Bench Press')
  await page.getByRole('button', { name: 'Add' }).click()
  await page.getByRole('button', { name: 'Start' }).click()
  await expect(page.getByText('No sets logged yet.')).toBeVisible()

  // Edit the exercise from the catalog
  await page.getByRole('button', { name: /^Manage/ }).click()
  await page.getByRole('button', { name: 'Edit exercise', exact: true }).click()
  await page.getByTestId('edit-exercise-name').fill('Incline Bench Press')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Incline Bench Press').first()).toBeVisible()

  // Add and edit a set
  await page.selectOption('select', { label: 'Incline Bench Press' })
  await page.fill('input[placeholder="reps"]', '8')
  await page.fill('input[placeholder="kg"]', '60')
  await page.getByRole('button', { name: 'Add set' }).click()
  await expect(page.getByText(/Incline Bench Press.*8 reps/)).toBeVisible()

  await page.getByRole('button', { name: 'Edit set', exact: true }).click()
  await page.getByTestId('edit-set-reps').fill('10')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText(/Incline Bench Press.*10 reps/)).toBeVisible()

  // Edit the session name
  await page.getByRole('button', { name: 'Edit session', exact: true }).click()
  await page.getByTestId('edit-session-name').fill('Push Day')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Push Day')).toBeVisible()

  // Delete the set
  await page.getByRole('button', { name: 'Delete set', exact: true }).click()
  await expect(page.getByText('No sets logged yet.')).toBeVisible()
})
