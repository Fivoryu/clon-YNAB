import { rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { seedDemoData } from '../../scripts/seed-demo-data.mjs';

const screenshotsDir = fileURLToPath(new URL('./screenshots', import.meta.url));

/**
 * Prepares a deterministic capture run:
 *  1. removes stale screenshots so the gallery always matches the manifest,
 *  2. rebuilds the demo budget in the local PostgreSQL dev database.
 *
 * The walkthrough is intentionally destructive against the seeded data: it confirms a funding
 * suggestion, records a transaction and registers a throwaway user. Rebuilding the seed before
 * every run is what keeps the published images reproducible. The reset only touches the local
 * development database; set `E2E_KEEP_DB=1` to seed idempotently instead, for example when the
 * database holds unrelated work you do not want truncated.
 */
export default async function globalSetup() {
  await rm(screenshotsDir, { recursive: true, force: true });
  await mkdir(screenshotsDir, { recursive: true });
  await seedDemoData({ reset: process.env.E2E_KEEP_DB !== '1' });
}
