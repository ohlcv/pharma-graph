import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@': resolve(here, 'src'),
    },
  },
  test: {
    globals: false,
    environment: 'node', // most pure-logic tests don't need DOM; individual tests can opt-in
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'scripts/**',
        'src/types/**',
        'src/ui/styles/**',
        'tests/**', // tests must never count toward coverage of production code
      ],
    },
  },
});
