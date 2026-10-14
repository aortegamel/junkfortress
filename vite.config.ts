import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: {
    host: true,
    allowedHosts: ['.trycloudflare.com'],
  },
  preview: {
    host: true,
    allowedHosts: ['.trycloudflare.com'],
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});