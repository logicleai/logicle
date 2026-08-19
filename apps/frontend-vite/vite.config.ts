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
    // Only relevant when run standalone (`vite dev`, not the middleware-mode
    // embed in apps/backend/server.ts) — proxy API calls to the real backend
    // so the spike can be clicked around without wiring server.ts at all.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: path.resolve(dirname, 'dist'),
    emptyOutDir: true,
  },
})
