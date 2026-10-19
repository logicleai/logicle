import { defineConfig } from 'tsup'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))
const explicitExternal = ['next', 'better-sqlite3', 'sharp']
const noExternal = Object.keys(pkg.dependencies ?? {}).filter(
  (dep) => !explicitExternal.includes(dep)
)

export default defineConfig({
  entry: { 'reencrypt-file-blobs': 'apps/backend/scripts/reencrypt-file-blobs.ts' },
  outDir: 'dist-reencrypt',
  target: 'node24',
  format: ['esm'],
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: false,
  esbuildOptions(options) {
    options.banner = {
      js: `import { createRequire as __createRequire } from 'module'; var require = __createRequire(import.meta.url);`,
    }
  },
  external: [/^next(?:\/.*)?$/, ...explicitExternal.slice(1)],
  noExternal,
})
