import react from '@vitejs/plugin-react';
import { rmSync } from 'node:fs';
import { defineConfig } from 'vitest/config';

// Real-API builds must not ship the MSW service worker.
const dropMockWorker = {
  name: 'drop-mock-worker',
  apply: 'build' as const,
  closeBundle() {
    if (process.env['VITE_NEXUS_API'] === 'real')
      rmSync('dist/mockServiceWorker.js', { force: true });
  },
};

export default defineConfig({
  plugins: [react(), dropMockWorker],
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  test: {
    environment: 'jsdom',
    setupFiles: ['./test/setup.ts'],
    include: ['test/**/*.test.{ts,tsx}'],
    css: false,
  },
});
