import { NextRequest, NextResponse } from 'next/server'
import micromatch from 'micromatch'

// API routes will manage authentication by themselves
const unAuthenticatedRoutes = ['/api/**', '/auth/**', '/internals/**', '_next/*']

// Middleware redirects all app routes which require authentication
// to login if session token is missing
export async function middleware(req: NextRequest) {
  console.log(`Serving ${req.url}`)

  // Don't mess with routes that don't require authentication
  const { pathname } = req.nextUrl
  if (micromatch.isMatch(pathname, unAuthenticatedRoutes)) {
    return NextResponse.next()
  }

  // TODO: use shared constants for cookie names (see authOptions)
  // This is just a pre-check. But auth() call does not seem to work
  // on node. API routes will use auth()
  const sessionToken = req.cookies.get('authjs.session-token')
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
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api).*)'],
}
