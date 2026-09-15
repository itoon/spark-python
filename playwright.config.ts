import { defineConfig, devices } from '@playwright/test'

const webServer = process.env.PLAYWRIGHT_SKIP_WEBSERVER ? undefined : {
  command: 'npm run dev -- --host localhost --port 3000',
  url: 'http://localhost:3000',
  reuseExistingServer: true,
  timeout: 120_000,
}

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer,
})
