import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    server: 'server.ts',
    'worker-script': 'packages/file-analyzer/src/worker/script.ts',
  },
  outDir: 'dist-server',
  target: 'node22',
  format: ['esm'],
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: false,
  external: ['next', 'ws', 'better-sqlite3', 'sharp', '@libpdf/core', 'mammoth', 'pptx2json', 'xlsx'], // 👈 important
})
