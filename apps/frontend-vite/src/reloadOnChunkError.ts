// A browser tab loaded before a deploy still holds the previous build's
// HTML, which references content-hashed chunk filenames
// (/assets/UsersPage-a1b2c3.js). Every route here is lazy-loaded (see
// router.tsx), so the first time that tab navigates to a route it hadn't
// already loaded, the chunk request 404s and the user lands on the error
// page.
//
// The fix is the standard Vite recipe: listen for `vite:preloadError` — the
// event Vite fires when a dynamically imported chunk fails to load — and
// hard-reload. index.html is served with `Cache-Control: no-cache`, so the
// reload fetches the fresh shell with the new asset hashes and the
// navigation then succeeds.
// https://vite.dev/guide/build.html#load-error-handling
//
// Scope: this only covers "the tab navigates after a deploy". It does not
// try to detect a new deploy while the user sits on one page — that is
// deliberately out of scope.

// Guard against a reload loop: if a chunk is genuinely missing or broken (a
// bad build, not a stale tab) the reload won't fix it, so only retry once
// per cooldown window and otherwise let the error surface via the route's
// errorElement.
const LAST_RELOAD_KEY = 'logicle:chunk-error-reload-at'
const RELOAD_COOLDOWN_MS = 15_000

function tryHardReload(): boolean {
  let lastReloadAt = 0
  try {
    lastReloadAt = Number(window.sessionStorage.getItem(LAST_RELOAD_KEY)) || 0
  } catch {
    // sessionStorage can throw (privacy mode, storage disabled) — fall
    // through and reload anyway; one extra reload is acceptable.
  }
  if (Date.now() - lastReloadAt < RELOAD_COOLDOWN_MS) return false
  try {
    window.sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()))
  } catch {
    // ignore — see above
  }
  window.location.reload()
  return true
}

export function installChunkErrorReload(): void {
  window.addEventListener('vite:preloadError', (event) => {
    if (tryHardReload()) {
      // Suppress Vite's default re-throw so React Router doesn't paint the
      // error page for a frame before the reload takes over.
      event.preventDefault()
    }
    // Otherwise we're inside the cooldown: a genuinely broken chunk. Let
    // Vite re-throw so the route's errorElement shows instead of looping.
  })
}
