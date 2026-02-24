import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    server: 'server.ts',
    'worker-pool': 'lib/workers/piscina-worker.ts',
  },
  outDir: 'dist-server',
  target: 'node22',
  format: ['esm'],
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: false,
  external: ['next', 'ws', 'piscina'], // 👈 important
})
