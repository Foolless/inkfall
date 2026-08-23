import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    // The container ships Chromium at a fixed path; honour it when present so
    // CI never re-downloads a browser it already has.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  webServer: {
    // --host 127.0.0.1 is load-bearing: vite preview otherwise binds to
    // "localhost", which resolves to ::1 first on the GitHub runner while
    // Playwright polls 127.0.0.1, and the wait times out on a server that is
    // in fact running perfectly.
    command: 'npm run build && npx vite preview --host 127.0.0.1 --port 4173 --strictPort',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
