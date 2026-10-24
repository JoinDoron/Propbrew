import { defineConfig, devices } from '@playwright/test';
const port = Number(process.env.PW_PORT ?? 3000);
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  use: { baseURL: `http://127.0.0.1:${port}`, ...devices['Desktop Chrome'], screenshot: 'only-on-failure' },
  webServer: process.env.PW_NO_SERVER ? undefined : { command: `npm run dev -- --webpack --port ${port}`, url: `http://127.0.0.1:${port}/api/v1/health`, reuseExistingServer: true, timeout: 120_000 },
});
