import { defineConfig } from 'vitest/config';

export default defineConfig({
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
      ],
    },
  },
});
