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

// Content-Security-Policy for the SPA shell. Verified against the built
// frontend with a headless-browser sweep of chat (KaTeX / mermaid / code
// highlighting / rich HTML), the recharts analytics dashboards, the Zod-heavy
// admin tool/backend/SSO forms and the styleguide: the only violation is a
// single guarded `Function("")` capability probe in Zod's `allowsEval`, which
// catches, reports once, and falls back to non-JIT validation with identical
// results — so `script-src 'self'` (no `'unsafe-eval'`) is functionally safe.
//
//  - style-src needs 'unsafe-inline': the head has an inline <style>, the
//    per-deployment brand CSS is injected as a <style> element, and KaTeX /
//    Prism / mermaid all set inline styles at runtime. Inline styles cannot
//    execute, and assistant-authored ones are already filtered in Markdown.tsx.
//  - Google Fonts: stylesheet from fonts.googleapis.com, files from
//    fonts.gstatic.com (see apps/frontend-vite/index.html).
//  - img-src keeps https:: model/provider logos are currently hotlinked from
//    www.cdnlogo.com, and assistants embed external images. Tightening this to
//    'self' data: blob: additionally closes chat-image exfiltration but needs
//    those logos self-hosted first — tracked separately.
//  - connect-src 'self' covers the same-origin API, chat streaming and the
//    satellite WebSocket (/api/rpc).
export const CSP_DIRECTIVES = [
  "default-src 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "object-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
].join('; ')

// `CSP_DISABLE=1` opts out entirely; `CSP_REPORT_ONLY=1` observes without
// enforcing (useful for the first rollout on an unfamiliar deployment).
export function applyCspHeaders(headers: Record<string, string>) {
  if (process.env.CSP_DISABLE === '1') return
  const name =
    process.env.CSP_REPORT_ONLY === '1'
      ? 'Content-Security-Policy-Report-Only'
      : 'Content-Security-Policy'
  headers[name] = CSP_DIRECTIVES
}

function escapeForScriptTag(json: string): string {
  return json.replace(/</g, '\\u003c')
}

function escapeForStyleTag(css: string): string {
  return css.replace(/<\/style>/gi, '<\\/style>')
}

function escapeHtmlText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function escapeHtmlAttr(value: string): string {
  return escapeHtmlText(value).replace(/"/g, '&quot;')
}

export async function injectBootstrapData(html: string): Promise<string> {
  const [environment, brand] = await Promise.all([getEnvironmentPayload(), getProvisionedBrandAssets()])

  const brandCss = brand.styles.map((s) => s.content).join('\n')
  // Brand CSS goes at the very end of <body>, after everything else: its
  // `:root` overrides (e.g. --primary) collide by name with the defaults in
  // globals.css, so it only wins on document order, and it must beat both
  // the built `<link>` stylesheet (prod) and the `<style>` Vite's dev server
  // appends to <head> at runtime when main.tsx imports globals.css.
  const bodyInjection =
    `<script id="${ENVIRONMENT_ELEMENT_ID}" type="application/json">` +
    `${escapeForScriptTag(JSON.stringify(environment))}</script>` +
    `<script id="${BRAND_I18N_ELEMENT_ID}" type="application/json">` +
    `${escapeForScriptTag(JSON.stringify(brand.i18n))}</script>` +
    `<style id="${BRAND_CSS_ELEMENT_ID}">${escapeForStyleTag(brandCss)}</style></body>`

  // Title and favicon come from the same per-deployment environment payload
  // rather than being fixed in index.html — set here so a brand's values are
  // already in the served HTML, with no post-hydration swap (flash).
  const faviconPath = environment.faviconPath || '/favicon.ico'

  return html
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtmlText(environment.appDisplayName)}</title>`)
    .replace(/<link\s+rel="icon"[^>]*>/i, `<link rel="icon" href="${escapeHtmlAttr(faviconPath)}" />`)
    .replace('</body>', bodyInjection)
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
  const shellHeaders: Record<string, string> = {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
    // Never cache the shell itself — it's what references the hashed
    // /assets/* filenames above, so a cached stale index.html would keep
    // pointing at assets a new deploy has already deleted.
    'Cache-Control': 'no-cache',
  }
  applyCspHeaders(shellHeaders)
  res.writeHead(200, shellHeaders)
  res.end(withBootstrap)
  return true
}
