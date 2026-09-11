import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:5173',
    // Locally, set PLAYWRIGHT_CHANNEL=chrome to drive system Chrome instead of
    // downloading a bundled Chromium — useful on networks that can't reach
    // Playwright's browser CDN. CI has no system Chrome, so it stays unset
    // there and uses the bundled build (see .github/workflows/ci.yml).
    channel: process.env.PLAYWRIGHT_CHANNEL || undefined,
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 30_000,
  },
})
