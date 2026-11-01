import { defineConfig } from 'vitest/config';

export default defineConfig({
  server: { fs: { allow: ['..'] } },
  worker: { format: 'es' },
  test: { environment: 'node', testTimeout: 20000 },
});
