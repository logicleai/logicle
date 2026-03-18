import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.{test,spec}.ts', '**/__tests__/**/*.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['lib/**'],
      exclude: ['lib/vendor/**'],
    },
  },
  resolve: {
    alias: [
      // Map "@/..." and tsconfig baseUrl bare imports to project root
      { find: '@', replacement: path.resolve(__dirname) },
      { find: /^(lib|models|db|types|components|services|utils|hooks|pages|app|context|ee)(\/.*)$/, replacement: path.resolve(__dirname, '$1$2') },
      { find: '@logicle/file-analyzer/analyzers', replacement: path.resolve(__dirname, 'packages/file-analyzer/src/analyzers.ts') },
      { find: '@logicle/file-analyzer/worker', replacement: path.resolve(__dirname, 'packages/file-analyzer/src/worker/runtime.ts') },
      { find: '@logicle/file-analyzer', replacement: path.resolve(__dirname, 'packages/file-analyzer/src/index.ts') },
    ],
  },
})
