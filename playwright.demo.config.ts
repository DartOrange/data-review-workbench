import { defineConfig } from '@playwright/test';
import base from './playwright.config';
import { resolve } from 'node:path';
export default defineConfig({
  ...base,
  use: { ...base.use, baseURL: 'http://127.0.0.1:3002' },
  webServer: {
    command: `"${resolve('demo/windows-x64/DataReviewWorkbench-1.0.0.exe')}" --no-open`,
    url: 'http://127.0.0.1:3002/api/health',
    reuseExistingServer: false,
    env: { DATABASE_PATH: `data/portable-e2e-${process.pid}.sqlite`, WORKBENCH_PORT: '3002' },
  },
});
