import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.{test,spec}.ts', '**/__tests__/**/*.ts'],
  },
  resolve: {
    // Map "@/..." to your project root or src; adjust as needed.
    alias: { '@': path.resolve(__dirname) }, // or path.resolve(__dirname, 'src')
  },
})
