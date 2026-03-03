import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['scripts/smoke.ts', 'scripts/integration-baseline.ts', 'scripts/providers-live.ts'],
  outDir: 'dist-scripts',
  target: 'node24',
  format: ['esm'],
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: false,
})
