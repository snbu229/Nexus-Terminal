import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://127.0.0.1:5173' },
  webServer: {
    command: 'pnpm exec vite --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env['CI'],
    env: { VITE_NEXUS_API: 'mock' },
  },
  projects: [
    { name: 'desktop', use: { viewport: { width: 1280, height: 800 } } },
    { name: 'mobile-360', use: { viewport: { width: 360, height: 640 }, hasTouch: true } },
  ],
});
