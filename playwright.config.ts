import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/browser',
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:3003',
    viewport: { width: 1440, height: 1050 },
    channel: process.env.PLAYWRIGHT_CHANNEL ?? 'msedge',
    trace: 'retain-on-failure',
  },
  reporter: 'list',
  webServer: {
    command: 'npm start',
    url: 'http://127.0.0.1:3003/api/health',
    reuseExistingServer: false,
    env: { DATABASE_PATH: `data/e2e-${process.pid}.sqlite`, WORKBENCH_PORT: '3003' },
  },
});
