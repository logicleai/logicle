import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['scripts/smoke.ts'],
  outDir: 'dist-scripts',
  target: 'node22',
  format: ['esm'],
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: false,
})
