import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globals: true,
  },
  coverage: {
    reporter: ['text', 'json-summary', 'lcov'],
  },
});
