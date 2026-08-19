import type { IncomingMessage, ServerResponse } from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as zlib from 'node:zlib'
import { lookup as lookupMimeType } from 'mime-types'
import { toNodeRequestUrl, toWebRequest } from '@/lib/router'
import { readSessionFromRequest } from '@/lib/auth/session'
import { getEnvironmentPayload, getProvisionedBrandAssets } from '@/lib/app-config'
import {
  BRAND_CSS_ELEMENT_ID,
  BRAND_I18N_ELEMENT_ID,
  ENVIRONMENT_ELEMENT_ID,
} from '@/lib/bootstrapPlaceholders'

// Spike counterpart to staticFrontend.ts, for a `vite build` of
// apps/frontend-vite instead of `next build --output export` of
// apps/frontend. The auth gate and bootstrap injection are byte-for-byte
// the same idea (and could share code with staticFrontend.ts verbatim in a
// real migration — duplicated here only so the spike doesn't touch the Next
// version at all). What's gone:
//   - resolveExportedHtmlFile's per-route HTML lookup: a Next static export
//     has one prebuilt HTML file per statically-known route; a Vite SPA
//     build has exactly one (index.html) for every route, since every page
//     in this app is already 'use client' (no server-rendered markup to
//     preserve per-route in the first place — see RootLayout.tsx). So this
//     always serves the one shell.
//   - the `.txt` flight-payload passthrough: that exists only to feed
//     Next's own client router; React Router does all of its navigation
//     client-side against the already-loaded app, no per-navigation fetch
//     to the server at all.
const PUBLIC_PATH_PREFIXES = ['/assets/']
const PUBLIC_EXACT_PATHS = new Set(['/favicon.ico', '/openapi.yaml', '/robots.txt'])

const isPubliclyServable = (pathname: string) =>
  PUBLIC_EXACT_PATHS.has(pathname) || PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))

function escapeForScriptTag(json: string): string {
  return json.replace(/</g, '\\u003c')
}

function escapeForStyleTag(css: string): string {
  return css.replace(/<\/style>/gi, '<\\/style>')
}

export async function injectBootstrapData(html: string): Promise<string> {
  const [environment, brand] = await Promise.all([getEnvironmentPayload(), getProvisionedBrandAssets()])

  const brandCss = brand.styles.map((s) => s.content).join('\n')
  const headInjection = `<style id="${BRAND_CSS_ELEMENT_ID}">${escapeForStyleTag(brandCss)}</style></head>`
  const bodyInjection =
    `<script id="${ENVIRONMENT_ELEMENT_ID}" type="application/json">` +
    `${escapeForScriptTag(JSON.stringify(environment))}</script>` +
    `<script id="${BRAND_I18N_ELEMENT_ID}" type="application/json">` +
    `${escapeForScriptTag(JSON.stringify(brand.i18n))}</script></body>`

  return html.replace('</head>', headInjection).replace('</body>', bodyInjection)
}

function redirect(res: ServerResponse, location: string) {
  res.writeHead(307, { Location: location }).end()
}

const COMPRESSIBLE_EXTENSIONS = new Set(['.js', '.mjs', '.css', '.svg', '.json', '.map', '.txt', '.yaml'])

// `/assets/*` filenames are content-hashed by `vite build` (a new hash on
// any change), so they're safe to cache aggressively and indefinitely —
// unlike index.html itself, which must always revalidate since it's what
// references those hashed filenames in the first place. Also gzips
// compressible file types on the fly when the client advertises support
// (effectively all of them) — this had no compression at all before,
// meaning every cold/full reload transferred assets at their raw minified
// size instead of the ~3-4x smaller gzipped one.
function serveAssetFile(req: IncomingMessage, res: ServerResponse, filePath: string): void {
  const contentType = lookupMimeType(filePath) || 'application/octet-stream'
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=31536000, immutable',
  }

  const ext = path.extname(filePath)
  const acceptsGzip = (req.headers['accept-encoding'] || '').includes('gzip')
  if (acceptsGzip && COMPRESSIBLE_EXTENSIONS.has(ext)) {
    headers['Content-Encoding'] = 'gzip'
    res.writeHead(200, headers)
    fs.createReadStream(filePath).pipe(zlib.createGzip()).pipe(res)
    return
  }

  res.writeHead(200, headers)
  fs.createReadStream(filePath).pipe(res)
}

// Same proxy.ts-derived auth gate as staticFrontend.ts, factored out so
// server.ts's vite-dev-middleware branch (see viteDevServer there) can apply
// it before handing off to Vite's own transformIndexHtml, the same way the
// prod path below applies it before reading the built index.html.
// Returns true if the request was fully handled (redirected).
export async function applyAuthGate(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = toNodeRequestUrl(req)
  const pathname = url.pathname
  const webRequest = toWebRequest(req, new AbortController().signal)
  const session = await readSessionFromRequest(webRequest)
  if (pathname === '/auth/login') {
    if (session) {
      redirect(res, '/chat')
      return true
    }
    return false
  }
  if (!session && pathname !== '/auth/join') {
    const callbackUrl = encodeURIComponent(url.pathname + url.search)
    redirect(res, `/auth/login?callbackUrl=${callbackUrl}`)
    return true
  }
  return false
}

// Minimal structural type for the bits of Vite's ViteDevServer this needs —
// avoids importing `vite` itself at the type level, which would pull the
// ~380MB dev-only package into production type-checking/bundling paths that
// never construct one (see server.ts's own comment on why `vite` is only
// ever dynamically imported).
interface ViteDevServerLike {
  middlewares: (req: IncomingMessage, res: ServerResponse, next: () => void) => void
  transformIndexHtml: (url: string, html: string) => Promise<string>
}

// Dev-mode counterpart to serveStaticFrontendVite below, for a Vite dev
// server running in middlewareMode instead of a `vite build` output — used
// by both apps/backend/server.ts (embedded, for `pnpm run dev`) and
// apps/frontend-vite/dev.ts (standalone, for `pnpm run dev:frontend` — the
// "Dev: Split" launch config). Factored out so both actually apply the same
// auth gate and bootstrap injection instead of one silently serving Vite's
// raw, ungated index.html.
export async function serveViteDevRequest(
  req: IncomingMessage,
  res: ServerResponse,
  viteDevServer: ViteDevServerLike,
  frontendViteRoot: string
): Promise<void> {
  // Let Vite serve/transform its own module graph (/src/*, /@vite/*,
  // /@react-refresh, etc.) first. If nothing in there matched, `next()`
  // fires and we fall through to rendering the (transformed) HTML shell
  // below.
  let fellThrough = false
  await new Promise<void>((resolve) => {
    viteDevServer.middlewares(req, res, () => {
      fellThrough = true
      resolve()
    })
    res.once('finish', resolve)
  })
  if (!fellThrough) return

  const pathname = toNodeRequestUrl(req).pathname

  // Vite-internal dev-asset paths (out-of-root imports served via /@fs/,
  // the HMR client, module-graph requests, ...) should never hit the
  // page-navigation auth gate below even if Vite's own middleware didn't
  // fully handle one for some reason (fs.allow denial, a stale/missing
  // module, ...) — a 404 here is a real dev-server problem to see in the
  // console, not a "log in" prompt. Without this, a request the auth gate
  // redirects instead of 404ing silently breaks whatever asset needed it
  // (e.g. a CSS import from outside the Vite root) with no indication why.
  if (
    pathname.startsWith('/@fs/') ||
    pathname.startsWith('/@vite/') ||
    pathname.startsWith('/@id/') ||
    pathname.startsWith('/@react-refresh') ||
    pathname.startsWith('/node_modules/')
  ) {
    res.writeHead(404).end()
    return
  }

  if (pathname === '/') {
    redirect(res, '/chat')
    return
  }
  if (await applyAuthGate(req, res)) return

  const template = await fs.promises.readFile(path.join(frontendViteRoot, 'index.html'), 'utf-8')
  const transformed = await viteDevServer.transformIndexHtml(req.url || '/', template)
  const withBootstrap = await injectBootstrapData(transformed)
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(withBootstrap)
}

export async function serveStaticFrontendVite(
  req: IncomingMessage,
  res: ServerResponse,
  outDir: string
): Promise<boolean> {
  const url = toNodeRequestUrl(req)
  const pathname = url.pathname

  if (pathname === '/') {
    redirect(res, '/chat')
    return true
  }

  if (isPubliclyServable(pathname)) {
    const filePath = path.join(outDir, pathname)
    if (!filePath.startsWith(outDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return false
    }
    serveAssetFile(req, res, filePath)
    return true
  }

  if (await applyAuthGate(req, res)) {
    return true
  }

  const htmlFile = path.join(outDir, 'index.html')
  const html = await fs.promises.readFile(htmlFile, 'utf-8')
  const withBootstrap = await injectBootstrapData(html)
  res.writeHead(200, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    // Never cache the shell itself — it's what references the hashed
    // /assets/* filenames above, so a cached stale index.html would keep
    // pointing at assets a new deploy has already deleted.
    'Cache-Control': 'no-cache',
  })
  res.end(withBootstrap)
  return true
}
