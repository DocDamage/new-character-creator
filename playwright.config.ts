import { defineConfig, devices } from '@playwright/test'

const browserProjects = process.env.PIXEL_CREATOR_BROWSER_MATRIX === '1'
  ? [
      {
        name: 'chromium',
        use: { ...devices['Desktop Chrome'] },
      },
      {
        name: 'firefox',
        use: { ...devices['Desktop Firefox'] },
      },
      {
        name: 'webkit',
        use: { ...devices['Desktop Safari'] },
      },
    ]
  : [
      {
        name: 'chromium',
        use: { ...devices['Desktop Chrome'] },
      },
    ]

export default defineConfig({
  testDir: './tests/browser',
  timeout: 180_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  retries: 0,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node tools/build-and-preview.js --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: false,
    timeout: 240_000,
  },
  projects: browserProjects,
})
