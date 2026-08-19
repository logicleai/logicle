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
  },
  build: {
    outDir: path.resolve(dirname, 'dist'),
    emptyOutDir: true,
  },
})
