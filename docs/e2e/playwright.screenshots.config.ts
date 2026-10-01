import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Local, opt-in Playwright configuration for the documentation screenshot walkthrough.
 *
 * It is intentionally separate from the root `playwright.config.ts` so the functional E2E suite
 * (`npm run test:e2e`) never depends on seeded demo data or on the screenshot output directory.
 *
 * Run with:
 *   npm run docs:screenshots
 */
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://ynab:ynab_local@localhost:5434/ynab_dev?schema=public';

export default defineConfig({
  testDir: '.',
  testMatch: /walkthrough\.spec\.ts/,
  timeout: 300_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  globalSetup: './global-setup.ts',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'screenshots',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    },
  ],
  webServer: [
    {
      command: 'npm run dev:api',
      cwd: repoRoot,
      port: 3001,
      env: { ...process.env, DATABASE_URL: databaseUrl, PORT: '3001' } as Record<string, string>,
      reuseExistingServer: true,
      timeout: 120_000,
    },
    {
      command: 'npm run dev:web -- --port 3000',
      cwd: repoRoot,
      url: 'http://127.0.0.1:3000',
      reuseExistingServer: true,
      timeout: 120_000,
    },
  ],
});
