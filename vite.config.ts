import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';

// TEMPORARY: replaced by the foundation crew's config at merge.
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  build: { rollupOptions: { input: { roomLab: 'room-lab.html' } } },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
