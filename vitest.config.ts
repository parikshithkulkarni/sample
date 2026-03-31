import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**/*.ts', 'app/api/**/*.ts'],
      exclude: ['lib/auth.ts', 'lib/db.ts'],
    },
    exclude: ['e2e/**', 'node_modules/**'],
    // Run integration tests sequentially to avoid mock state conflicts
    pool: 'forks',
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
