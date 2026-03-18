import { defineConfig } from 'tsup'

export default defineConfig({
  entry: [
    'apps/backend/scripts/smoke.ts',
    'apps/backend/scripts/integration-baseline.ts',
    'apps/backend/scripts/providers-live.ts',
  ],
  outDir: 'dist-scripts',
  target: 'node24',
  format: ['esm'],
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: false,
})
