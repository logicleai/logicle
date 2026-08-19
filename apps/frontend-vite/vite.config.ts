import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tsconfigPaths from 'vite-tsconfig-paths'
import path from 'node:path'

// Spike counterpart to apps/frontend/next.config.ts. `next build`'s
// `output: 'export'` produces one HTML file per route (see
// resolveExportedHtmlFile in staticFrontend.ts); a plain Vite SPA build
// produces a single index.html shell instead, since every page here is
// already 'use client' (no server-rendered content to preserve either way —
// see the spike notes in staticFrontendVite.ts).
const dirname = import.meta.dirname
const repoRoot = path.resolve(dirname, '..', '..')

export default defineConfig({
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
    },
  },
  optimizeDeps: {
    // @tabler/icons-react and lucide-react each export thousands of icons as
    // individual submodules. Vite's dep-optimizer scan crawls the module
    // graph from index.html to decide what to pre-bundle, but almost every
    // route here is behind React Router's `lazy` (see router.tsx) — so most
    // icon imports live behind a dynamic import the initial scan may not
    // reach before the browser starts requesting them, and each one becomes
    // its own HTTP request instead of one pre-bundled chunk. Forcing them in
    // here (evaluated regardless of what the scanner finds) is the standard
    // fix for this exact class of slow-dev-startup complaint with these two
    // packages specifically.
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
  define: {
    // packages/core/src/env.ts (imported client-side as `@/lib/env`) reads
    // plain `process.env.X` at module scope. Next's build silently replaces
    // these with `undefined` (client bundles never get real values for
    // non-NEXT_PUBLIC_ vars); this reproduces that instead of a
    // `process is not defined` crash, since Vite doesn't polyfill `process`.
    'process.env': '{}',
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
})
