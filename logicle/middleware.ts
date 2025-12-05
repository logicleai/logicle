import { NextRequest, NextResponse } from 'next/server'
import micromatch from 'micromatch'
import { SESSION_COOKIE_NAME } from './lib/auth/session'

// API routes will manage authentication by themselves
const unAuthenticatedRoutes = ['/api/**', '/auth/**', '/internals/**', '_next/*']

// Middleware redirects all app routes which require authentication
// to login if session token is missing
export async function middleware(req: NextRequest) {
  // Don't mess with routes that don't require authentication
  const { pathname } = req.nextUrl
  if (true || micromatch.isMatch(pathname, unAuthenticatedRoutes)) {
    return NextResponse.next()
  }

  // TODO: use shared constants for cookie names (see authOptions)
  // This is just a pre-check. But auth() call does not seem to work
  // on node. API routes will use auth()
  const sessionToken = req.cookies.get(SESSION_COOKIE_NAME)
  if (!sessionToken) {
    const url = new URL('/auth/login', req.url)
    url.searchParams.set('callbackUrl ', encodeURI(req.url))
    return NextResponse.redirect(url)
  }
  return NextResponse.next()
}

// We disable middleware altogether for API routes, as middleware
// caches the entire request body (not very clever for file uploads)
export const config = {
  matcher: ['/((?!api|_next/static|_next/image|assets|favicon.ico|openapi.json).*)'],
}
