import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import { nodePolyfills } from 'vite-plugin-node-polyfills'
import path from 'node:path'

// Spike counterpart to apps/frontend/next.config.ts. `next build`'s
// `output: 'export'` produces one HTML file per route (see
// resolveExportedHtmlFile in staticFrontend.ts); a plain Vite SPA build
// produces a single index.html shell instead, since every page here is
// already 'use client' (no server-rendered content to preserve either way —
// see the spike notes in staticFrontendVite.ts).
const dirname = import.meta.dirname
const repoRoot = path.resolve(dirname, '..', '..')

export default defineConfig(({ command }) => ({
  root: dirname,
  // favicon.ico, logo.png, openapi.yaml, etc. still live under
  // apps/frontend/public/ — pointed at directly (not duplicated) so both
  // `vite dev` and `vite build` serve/copy them the same way Vite's own
  // `public/` convention would. staticFrontendVite.ts's `isPubliclyServable`
  // allowlist (prod) and Vite's built-in publicDir middleware (dev, ahead of
  // serveViteDevRequest's auth gate) both rely on these actually existing
  // under the build output / dev server root.
  publicDir: path.resolve(dirname, '..', 'frontend', 'public'),
  plugins: [
    // Reads the same tsconfig.json `paths` table Next/webpack already use
    // (repoRoot/tsconfig.json) — lets real app code (e.g. the chat feature
    // under apps/frontend/app/chat, imported unmodified below) resolve its
    // own `@/services/...`, `@/hooks/...`, `@/types/...` etc. imports
    // exactly as it does today, without duplicating that alias table here.
    tsconfigPaths({ root: repoRoot, projects: [path.join(repoRoot, 'tsconfig.json')] }),
    react(),
    // Some real backend-shared code reachable from the client bundle
    // (packages/core/src/openapi.ts, via @readme/openapi-parser and its own
    // dependency tree — used by the admin tools OpenAPI-import form) checks
    // for bare Node globals (`process`, not just `process.env`) and imports
    // Node core modules (path, util, http, https, ...) that a browser build
    // just externalizes rather than provides, which crashed that one route
    // outright. This polyfills both — a browser-safe `process`/`Buffer`/
    // `global` plus stand-ins for the Node builtins those dependencies
    // import — for the whole app, replacing the narrower manual
    // `define: {'process.env': '{}'}` below.
    nodePolyfills({
      // Only `process` needs to actually resolve to something at runtime for
      // this to stop crashing; the Node builtins (path/util/http/https/...)
      // just need to not be `undefined` at import time; unused. Excluding
      // Buffer avoids pulling its (nontrivial) polyfill into every page's
      // bundle for functionality nothing here needs.
      globals: { process: true, Buffer: false, global: true },
    }),
  ],
  resolve: {
    alias: {
      // Ported real components (ChatSection.tsx, ChatPageContextProvider.tsx)
      // still import these Next-only modules — swapped for React Router
      // equivalents so the real source files don't need edits. See each
      // shim file's comment for why the swap is safe.
      'next/navigation': path.resolve(dirname, 'src/shims/nextNavigationShim.tsx'),
      'next/link': path.resolve(dirname, 'src/shims/nextLinkShim.tsx'),
      'next/image': path.resolve(dirname, 'src/shims/nextImageShim.tsx'),
      '@/lib/clientRouter': path.resolve(dirname, 'src/shims/clientRouterShim.tsx'),
      // Dev-only: @tabler/icons-react and lucide-react each export thousands
      // of icons as individual ESM submodules from their default (`module`)
      // entry. esbuild's dep-optimizer always code-splits its own output
      // (not configurable — `optimizeDeps.esbuildOptions.splitting: false`
      // is silently ignored for the dep-optimize step), so pre-bundling
      // either package still produces one output chunk *per icon actually
      // imported anywhere in the app* — tolerable with the browser's HTTP
      // cache on, unusable with it off (every request pays a full round
      // trip; this is what motivated the alias in the first place). Both
      // packages also ship a single-file CJS bundle (their `main` entry)
      // containing every icon — esbuild can't code-split a CommonJS module
      // the way it does ESM re-exports, so aliasing straight to that entry
      // collapses the whole thing to one request.
      //
      // Production must NOT get this alias: a CJS bundle can't be
      // tree-shaken, so every route that touches any icon would pull in
      // every icon in both packages — confirmed by `vite build` turning a
      // ~530KB chunk into a 6MB one. Real users pay for that on every page
      // load; a local dev server request-count problem doesn't apply to
      // them the same way (no disabled cache, no thousands of round trips
      // to a remote origin). So this only applies to `vite dev`/the
      // middleware-mode embed in server.ts (`command === 'serve'` either
      // way) — `vite build` keeps the real ESM barrel and its per-icon
      // splitting, which is exactly the code-splitting you want in prod.
      ...(command === 'serve'
        ? {
            '@tabler/icons-react': '@tabler/icons-react/dist/cjs/tabler-icons-react.cjs',
            'lucide-react': 'lucide-react/dist/cjs/lucide-react.js',
          }
        : {}),
    },
  },
  optimizeDeps: {
    // Forces eager pre-bundling of the two entries above (whichever variant
    // the alias resolved above picked) regardless of whether Vite's
    // dep-scanner reaches them before the browser starts requesting them —
    // almost every route here is behind React Router's `lazy` (see
    // router.tsx), so the scanner doesn't reliably discover icon imports up
    // front.
    include: ['@tabler/icons-react', 'lucide-react'],
  },
  css: {
    // Explicit path, not left to Vite's default postcss-load-config search:
    // that search starts from the CSS *file's* directory and walks upward,
    // so it was finding apps/frontend/postcss.config.cjs (which sits right
    // next to globals.css) before ever reaching this app's own config —
    // silently using the wrong tailwind.config.cjs (relative `content`
    // globs resolved against the wrong cwd) and producing an effectively
    // unstyled app.
    postcss: path.resolve(dirname, 'postcss.config.cjs'),
  },
  server: {
    // Only relevant when run standalone via `pnpm run dev:frontend` (not the
    // middleware-mode embed in apps/backend/server.ts, which is what
    // `pnpm run dev` uses). Vite's CLI doesn't read the generic `PORT` env
    // var other scripts in this repo rely on (apps/proxy.ts, server.ts) —
    // read it explicitly so `dev:frontend`'s `PORT=3002` actually takes
    // effect instead of silently falling back to Vite's default (5173),
    // which would leave the "Dev: Split" launch config's proxy (targeting
    // :3002) pointed at nothing.
    port: Number(process.env.PORT) || 3002,
    strictPort: true,
    // Proxy API calls to the real backend so this can be clicked around
    // standalone. Same default apps/proxy.ts's BACKEND_URL uses; override
    // together with it if the backend runs elsewhere.
    proxy: {
      '/api': process.env.BACKEND_URL || 'http://localhost:3001',
    },
    fs: {
      // Vite's default fs.allow (the Vite `root` plus its auto-detected
      // workspace root) did not reliably cover apps/frontend/ as a sibling
      // of this app's own root in practice — real components imported from
      // there (e.g. ChatSection.tsx) happened to resolve fine since they're
      // reached indirectly through tsconfig-paths/esbuild module resolution,
      // but a direct out-of-root asset request (globals.css, imported by
      // main.tsx) 404'd. Explicit is more reliable than relying on
      // autodetection across a monorepo boundary like this one.
      allow: [repoRoot],
    },
  },
  build: {
    outDir: path.resolve(dirname, 'dist'),
    emptyOutDir: true,
  },
}))
