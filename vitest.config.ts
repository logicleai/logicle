import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['**/__tests__/**/*.{test,spec}.ts', '**/__tests__/**/*.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      include: ['packages/core/src/lib/**'],
      exclude: ['packages/core/src/lib/vendor/**'],
    },
  },
  resolve: {
    alias: [
      { find: /^@\/lib(\/.*)?$/, replacement: path.resolve(__dirname, 'packages/core/src/lib$1') },
      { find: /^@\/models(\/.*)?$/, replacement: path.resolve(__dirname, 'packages/core/src/models$1') },
      { find: /^@\/db(\/.*)?$/, replacement: path.resolve(__dirname, 'packages/core/src/db$1') },
      { find: /^@\/types(\/.*)?$/, replacement: path.resolve(__dirname, 'packages/core/src/types$1') },
      { find: /^@\/ee(\/.*)?$/, replacement: path.resolve(__dirname, 'packages/core/src/ee$1') },
      { find: /^@\/components(\/.*)?$/, replacement: path.resolve(__dirname, 'apps/frontend/components$1') },
      { find: /^@\/services(\/.*)?$/, replacement: path.resolve(__dirname, 'apps/frontend/services$1') },
      { find: /^@\/hooks(\/.*)?$/, replacement: path.resolve(__dirname, 'apps/frontend/hooks$1') },
      { find: /^@\/pages(\/.*)?$/, replacement: path.resolve(__dirname, 'apps/frontend/pages$1') },
      { find: /^@\/app\/api(\/.*)?$/, replacement: path.resolve(__dirname, 'apps/backend/api$1') },
      { find: /^@\/app(\/.*)?$/, replacement: path.resolve(__dirname, 'apps/frontend/app$1') },
      { find: /^@\/api(\/.*)?$/, replacement: path.resolve(__dirname, 'apps/backend/api$1') },
      { find: /^@\/backend(\/.*)?$/, replacement: path.resolve(__dirname, 'apps/backend$1') },
      { find: /^lib(\/.*)?$/, replacement: path.resolve(__dirname, 'packages/core/src/lib$1') },
      { find: /^models(\/.*)?$/, replacement: path.resolve(__dirname, 'packages/core/src/models$1') },
      { find: /^db(\/.*)?$/, replacement: path.resolve(__dirname, 'packages/core/src/db$1') },
      { find: /^types(\/.*)?$/, replacement: path.resolve(__dirname, 'packages/core/src/types$1') },
      { find: /^ee(\/.*)?$/, replacement: path.resolve(__dirname, 'packages/core/src/ee$1') },
      { find: /^components(\/.*)?$/, replacement: path.resolve(__dirname, 'apps/frontend/components$1') },
      { find: /^services(\/.*)?$/, replacement: path.resolve(__dirname, 'apps/frontend/services$1') },
      { find: /^hooks(\/.*)?$/, replacement: path.resolve(__dirname, 'apps/frontend/hooks$1') },
      { find: /^pages(\/.*)?$/, replacement: path.resolve(__dirname, 'apps/frontend/pages$1') },
      { find: /^app(\/.*)?$/, replacement: path.resolve(__dirname, 'apps/frontend/app$1') },
      { find: /^backend(\/.*)?$/, replacement: path.resolve(__dirname, 'apps/backend$1') },
      { find: /^templates$/, replacement: path.resolve(__dirname, 'packages/core/src/templates.ts') },
      { find: '@logicle/file-analyzer/analyzers', replacement: path.resolve(__dirname, 'packages/file-analyzer/src/analyzers.ts') },
      { find: '@logicle/file-analyzer/worker', replacement: path.resolve(__dirname, 'packages/file-analyzer/src/worker/runtime.ts') },
      { find: '@logicle/file-analyzer', replacement: path.resolve(__dirname, 'packages/file-analyzer/src/index.ts') },
      { find: '@', replacement: path.resolve(__dirname) },
    ],
  },
})
