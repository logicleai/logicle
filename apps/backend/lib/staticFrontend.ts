import type { IncomingMessage, ServerResponse } from 'node:http'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { lookup as lookupMimeType } from 'mime-types'
import { toNodeRequestUrl, toWebRequest } from '@/lib/router'
import { readSessionFromRequest } from '@/lib/auth/session'
import { getEnvironmentPayload, getProvisionedBrandAssets } from '@/lib/app-config'
import {
  BRAND_CSS_ELEMENT_ID,
  BRAND_I18N_ELEMENT_ID,
  ENVIRONMENT_ELEMENT_ID,
} from '@/lib/bootstrapPlaceholders'

// Replaces what Next used to do at request time for `apps/frontend` (SSR of
// the env/brand bootstrap, and the proxy.ts auth redirect) now that
// `next build` produces a fully static export (see next.config.ts
// `output: 'export'`). Next itself is build-time only from here on;
// everything in this file is genuinely hand-rolled.

// Paths that must be servable with no auth check — the login page itself
// needs its JS/CSS/branding assets before any session can be established.
// Mirrors the old proxy.ts matcher's exclusions, minus /api (handled earlier
// in server.ts, before this is ever called).
const PUBLIC_PATH_PREFIXES = ['/_next/', '/assets/']
const PUBLIC_EXACT_PATHS = new Set(['/favicon.ico', '/openapi.yaml', '/robots.txt'])

const isPubliclyServable = (pathname: string) =>
  PUBLIC_EXACT_PATHS.has(pathname) || PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))

function escapeForScriptTag(json: string): string {
  // Prevents a literal `</script>` inside the JSON payload from prematurely
  // closing the tag we're injecting it into.
  return json.replace(/</g, '\\u003c')
}

function escapeForStyleTag(css: string): string {
  return css.replace(/<\/style>/gi, '<\\/style>')
}

async function injectBootstrapData(html: string): Promise<string> {
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

// Static export names dynamic-route HTML files after the single
// generateStaticParams() placeholder value ('_' — see the per-route
// page.tsx wrappers under apps/frontend/app). The real id is read
// client-side via useParams() against the live URL, so serving that
// placeholder shell for any concrete id is correct.
function resolveExportedHtmlFile(outDir: string, pathname: string): string | undefined {
  const segments = pathname.split('/').filter(Boolean)

  const candidate = (parts: string[]) => path.join(outDir, ...parts) + '.html'

  const exact = candidate(segments)
  if (fs.existsSync(exact)) return exact

  for (let i = segments.length - 1; i >= 0; i--) {
    const withPlaceholder = [...segments]
    withPlaceholder[i] = '_'
    const file = candidate(withPlaceholder)
    if (fs.existsSync(file)) return file
  }

  return undefined
}

function redirect(res: ServerResponse, location: string) {
  res.writeHead(307, { Location: location }).end()
}

// Returns true if the request was fully handled.
export async function serveStaticFrontend(
  req: IncomingMessage,
  res: ServerResponse,
  outDir: string
): Promise<boolean> {
  const url = toNodeRequestUrl(req)
  let pathname = url.pathname

  // Mirrors next.config.ts's redirects()/rewrites() (no longer applied
  // automatically once Next is build-time only).
  if (pathname === '/') {
    redirect(res, '/chat')
    return true
  }
  if (pathname === '/.well-known/saml.cer') {
    pathname = '/api/well-known/saml.cer'
  } else if (pathname === '/.well-known/saml-configuration') {
    pathname = '/well-known/saml-configuration'
  }

  // Next's client router speculatively prefetches a route's RSC payload
  // (`/some/route/__next.<hash>.txt` et al) before a hard navigation, to
  // reuse it if the user does navigate there. Static export serves none of
  // this — there's no RSC server — so Next always falls back to a full
  // page navigation on an unsuccessful prefetch. Without this check that
  // fallback still works, but only after the request falls through the
  // auth gate below and gets redirected to a full login *page* (a page
  // load's worth of work for what should be an instant 404, and noisy in
  // the browser's network log). Matching it here short-circuits straight
  // to 404, same as any other genuinely missing asset.
  if (pathname.includes('/__next.')) {
    res.writeHead(404).end()
    return true
  }

  if (isPubliclyServable(pathname)) {
    const filePath = path.join(outDir, pathname)
    if (!filePath.startsWith(outDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      return false
    }
    const contentType = lookupMimeType(filePath) || 'application/octet-stream'
    res.writeHead(200, { 'Content-Type': contentType })
    fs.createReadStream(filePath).pipe(res)
    return true
  }

  // Same auth gate proxy.ts used to run for every non-asset route.
  const webRequest = toWebRequest(req, new AbortController().signal)
  const session = await readSessionFromRequest(webRequest)
  if (pathname === '/auth/login') {
    if (session) {
      redirect(res, '/chat')
      return true
    }
  } else if (!session && pathname !== '/auth/join') {
    const callbackUrl = encodeURIComponent(url.pathname + url.search)
    redirect(res, `/auth/login?callbackUrl=${callbackUrl}`)
    return true
  }

  const htmlFile = resolveExportedHtmlFile(outDir, pathname) ?? path.join(outDir, '404.html')
  const status = htmlFile.endsWith('404.html') ? 404 : 200
  const html = await fs.promises.readFile(htmlFile, 'utf-8')
  const withBootstrap = await injectBootstrapData(html)
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    'X-Robots-Tag': 'noindex, nofollow, noarchive',
  })
  res.end(withBootstrap)
  return true
}
