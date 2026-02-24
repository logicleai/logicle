import { defineConfig } from 'tsup'

export default defineConfig([
  {
    entry: {
      server: 'server.ts',
    },
    outDir: 'dist-server',
    target: 'node22',
    format: ['esm'],
    platform: 'node',
    sourcemap: true,
    clean: true,
    dts: false,
    external: ['next', 'ws', 'piscina'],
  },
  {
    entry: {
      'worker-pool': 'lib/workers/piscina-worker.ts',
    },
    outDir: 'dist-server',
    target: 'node22',
    format: ['cjs'],
    platform: 'node',
    sourcemap: true,
    clean: false,
    dts: false,
    noExternal: [/.*/],
    outExtension() {
      return { js: '.cjs' }
    },
  },
])
