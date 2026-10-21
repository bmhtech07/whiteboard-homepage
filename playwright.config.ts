import { defineConfig } from '@playwright/test'

// The e2e tests load the built extension (dist/) into Chromium, so run
// `npm run build` first (or use `npm run test:e2e`, which does both).
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 5_000 },
  workers: 1,
  reporter: [['list']],
  use: { trace: 'retain-on-failure' },
})
