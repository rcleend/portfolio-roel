import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // Pixel fonts and sprite data are tiny; inlining them only bloats the JS bundle.
    assetsInlineLimit: 0,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    restoreMocks: true,
  },
});
