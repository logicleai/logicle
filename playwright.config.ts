import { defineConfig, devices } from '@playwright/test'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:31245'
const testRunId = Date.now()
const databasePath = `/tmp/logicle-playwright-1145-${testRunId}.sqlite`
const fileStoragePath = `/tmp/logicle-playwright-files-1145-${testRunId}`
const provisionPath = `/tmp/logicle-playwright-provision-1145-${testRunId}`

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `mkdir -p ${provisionPath} && PORT=31245 APP_URL=http://127.0.0.1:31245 DATABASE_URL=file://${databasePath} FILE_STORAGE_LOCATION=${fileStoragePath} PROVISION_PATH=${provisionPath} ENABLE_SIGNUP=1 npm run dev`,
        url: `${baseURL}/auth/login`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
})
