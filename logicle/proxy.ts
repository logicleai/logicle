import { NextRequest, NextResponse } from 'next/server'
import micromatch from 'micromatch'
import { readSessionFromRequest } from './lib/auth/session'

// API routes will manage authentication by themselves
const unAuthenticatedRoutes = ['/api/**', '/internals/**', '_next/*']

// Middleware redirects all app routes which require authentication
// to login if session token is missing
export async function proxy(req: NextRequest) {
  // Don't mess with routes that don't require authentication
  const { pathname } = req.nextUrl
  if (micromatch.isMatch(pathname, unAuthenticatedRoutes)) {
    return NextResponse.next()
  }

  const session = await readSessionFromRequest(req)
  if (req.nextUrl.pathname === '/auth/login') {
    if (session) {
      const url = new URL('/chat', req.url)
      return NextResponse.redirect(url)
    }
  } else if (!session) {
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
