import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { gatePlugin } from './scripts/gatePlugin.ts';
import { glslMinifyPlugin } from './scripts/glslMinify.ts';
import { pngSlimPlugin } from './scripts/pngSlim.ts';
import { stillPlugin } from './scripts/stillPlugin.ts';

export default defineConfig({
  plugins: [glslMinifyPlugin(), react(), pngSlimPlugin(), stillPlugin(), gatePlugin()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    // Pixel fonts and sprite data are tiny; inlining them only bloats the JS bundle.
    assetsInlineLimit: 0,
  },
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'scripts/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
  },
});
