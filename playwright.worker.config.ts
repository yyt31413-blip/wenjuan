import base from './playwright.config';
import { defineConfig } from '@playwright/test';
process.env.WORKER_E2E = 'true';
export default defineConfig({
  ...base,
  webServer: {
    command: 'node scripts/worker-test-server.mjs',
    url: 'http://localhost:3000',
    reuseExistingServer: false,
    timeout: 120000,
  },
});
