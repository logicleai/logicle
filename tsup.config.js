import { defineConfig } from 'tsup'
import { readFileSync } from 'node:fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'))

// Packages that must stay external at runtime:
//   - next          → provided by the standalone output's node_modules
//   - native        → require prebuilt binaries, can't be bundled
const explicitExternal = [
  'next',
  'better-sqlite3',
  'sharp',
]

// Automatically bundle every dependency that isn't explicitly external.
// This list stays in sync with package.json without manual maintenance.
const noExternal = Object.keys(pkg.dependencies ?? {}).filter(
  (dep) => !explicitExternal.includes(dep)
)

export default defineConfig({
  entry: {
    server: 'apps/backend/server.ts',
    'worker-script': 'packages/file-analyzer/src/worker/script.ts',
    'search-script': 'apps/backend/lib/search/script.ts',
  },
  outDir: 'dist-server',
  target: 'node24',
  format: ['esm'],
  platform: 'node',
  sourcemap: true,
  clean: true,
  dts: false,
  // Inject a createRequire shim into every output file (including chunks) so
  // that CJS modules bundled into ESM output can use require() for Node builtins.
  esbuildOptions(options) {
    const cjsShim = `import { createRequire as __createRequire } from 'module'; var require = __createRequire(import.meta.url);`
    options.banner = { js: options.banner?.js ? `${cjsShim}\n${options.banner.js}` : cjsShim }
  },
  external: [/^next(?:\/.*)?$/, ...explicitExternal.slice(1)],
  noExternal,
})
