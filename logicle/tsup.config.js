import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['server.ts'],
  outDir: 'dist-server',
  target: 'node22',
  format: ['esm'],
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: false,
  external: ['next', 'ws'], // 👈 important
})
