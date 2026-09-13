import { defineConfig, devices } from '@playwright/test';

const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://ynab:ynab_local@localhost:5432/ynab_dev?schema=public';
const reuseExistingServer = !process.env.CI;

export default defineConfig({
  testDir: './apps/web/e2e',
  timeout: 30_000,
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'npm run dev:api',
      port: 3001,
      env: { ...process.env, DATABASE_URL: databaseUrl, PORT: '3001' } as Record<string, string>,
      reuseExistingServer,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:web -- --port 3000',
      url: 'http://127.0.0.1:3000',
      reuseExistingServer,
      timeout: 120_000,
    },
  ],
});
