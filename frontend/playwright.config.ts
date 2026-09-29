import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  // Every test shares one backend + one frontend dev server (see webServer
  // below) rather than each worker getting its own — running workers in
  // parallel makes them race each other's requests against that one shared
  // server, causing intermittent "element not stable" / stale-data failures
  // that have nothing to do with the code under test.
  workers: 1,
  expect: {
    // Playwright's 5s default is tight for an assertion that depends on a
    // network round trip landing first (switch tabs, then assert a value
    // that only shows up after a query refetches) — comfortably fine on a
    // local machine, but CI's shared runner is measurably slower and has
    // intermittently failed several unrelated tests on exactly this margin
    // (each one individually correct, just impatient). Bumping the default
    // once here beats chasing each flake with its own explicit timeout.
    timeout: 10_000,
  },
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
