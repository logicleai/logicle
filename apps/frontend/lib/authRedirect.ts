// Every page but /auth/login and /auth/join requires a session (see the
// server-side auth gate in apps/backend/lib/staticFrontendVite.ts), so a 401
// from any API call made outside those two pages is an unambiguous "the
// session is no longer valid" signal — except the login/join forms
// themselves, which legitimately get a 401 (or now 400, see the login
// route) while the user is still entering credentials; redirecting there
// would fight the in-progress form.
//
// `redirecting` is a module-level singleton (not per-caller state) so that
// concurrent requests that all 401 around the same time only trigger one
// navigation instead of racing each other.
let redirecting = false

function isAuthPage() {
  return window.location.pathname.startsWith('/auth/')
}

export function handleUnauthenticated() {
  if (typeof window === 'undefined' || redirecting || isAuthPage()) return
  redirecting = true
  const callbackUrl = encodeURIComponent(window.location.pathname + window.location.search)
  window.location.href = `/auth/login?callbackUrl=${callbackUrl}`
}
