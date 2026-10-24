import { defineConfig } from 'vitest/config'

// Keep package tests separate from Vite's demo directory.
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
  },
})
