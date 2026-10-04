import { defineConfig } from '@playwright/test';
import { resolve } from 'node:path';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.playwright-browsers');
const port = Number(process.env.E2E_WEB_PORT??(process.env.E2E_PREVIEW ? 5174 : 5173));
const onlinePort=Number(process.env.ONLINE_PORT??3001);
export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  workers: 1,
  use: { baseURL: `http://127.0.0.1:${port}`, viewport: { width: 1500, height: 1000 } },
  webServer: [{ command: process.env.E2E_PREVIEW ? `npm.cmd run preview -- --port ${port}` : `npm.cmd run dev -- --port ${port}`,
    url: `http://127.0.0.1:${port}`, reuseExistingServer: !process.env.CI && !process.env.E2E_PREVIEW },
    { command:'node --import tsx tests/browser/server-fixture.ts',url:`http://127.0.0.1:${onlinePort}/health`,reuseExistingServer:false }],
});
