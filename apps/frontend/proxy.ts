import { NextRequest, NextResponse } from 'next/server'
import { readSessionFromRequest } from '@/lib/auth/session'

// Dead at runtime under `output: 'export'` (next.config.ts) — Next disables
// middleware/proxy entirely for static exports. Kept in place rather than
// deleted: removing it makes Next/Turbopack's proxy-file detection fall
// through to an unrelated, identically-named apps/proxy.ts (a dev-mode
// reverse-proxy script, see #789) and fail the build on that file's shape
// instead. The real replacement — same redirect logic, hand-rolled — is
// serveStaticFrontend in apps/backend/lib/staticFrontend.ts.
//
// Middleware redirects all app routes which require authentication
// to login if session token is missing
export async function proxy(req: NextRequest) {
  const session = await readSessionFromRequest(req)
  if (req.nextUrl.pathname === '/auth/login') {
    if (session) {
      const url = new URL('/chat', req.url)
      return NextResponse.redirect(url)
    }
  } else if (!session && req.nextUrl.pathname !== '/auth/join') {
    const url = new URL('/auth/login', req.url)
    url.searchParams.set('callbackUrl ', encodeURI(req.url))
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

// We disable middleware altogether for API routes, as middleware
// caches the entire request body (not very clever for file uploads)
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|assets|favicon.ico|openapi.yaml|robots.txt).*)'],
}
