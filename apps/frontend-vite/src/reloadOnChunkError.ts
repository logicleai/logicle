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

// Loop protection. If a chunk is genuinely missing or broken (a bad build,
// not a stale tab) the reload won't fix it, so we must never reload more
// than once for it within a short window. Two independent guards, OR'd
// together — a reload loop needs BOTH to fail at the same time — and both
// self-re-arm after RELOAD_COOLDOWN_MS so a later, unrelated deploy is still
// handled by the same long-lived tab:
//
//  1. A sessionStorage timestamp. Survives the reload; the primary guard.
//  2. Navigation Timing. `location.reload()` makes the next load's
//     navigation type `"reload"` (per spec), so a freshly-reloaded document
//     has already spent its attempt. Needs no storage — this is what stops
//     a loop when sessionStorage is blocked entirely (locked-down browser,
//     partitioned context). Only counted while the load is still fresh
//     (`performance.now() < cooldown`) so a tab reloaded long ago isn't
//     permanently barred from recovering.
const LAST_RELOAD_KEY = 'logicle:chunk-error-reload-at'
const RELOAD_COOLDOWN_MS = 15_000

let installed = false

function reloadedRecentlyPerStorage(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(LAST_RELOAD_KEY)) || 0
    return last > 0 && Date.now() - last < RELOAD_COOLDOWN_MS
  } catch {
    // sessionStorage blocked (privacy mode, storage disabled, partitioned
    // context) — guard #2 takes over.
    return false
  }
}

function reloadedRecentlyPerNavigationTiming(): boolean {
  try {
    if (performance.now() >= RELOAD_COOLDOWN_MS) return false
    const [nav] = performance.getEntriesByType('navigation') as PerformanceNavigationTiming[]
    if (nav) return nav.type === 'reload'
    // Deprecated Navigation Timing L1, but present in browsers too old for
    // the L2 entry type above (e.g. Safari < 15). type 1 === TYPE_RELOAD.
    const legacyNav = (performance as { navigation?: { type: number } }).navigation
    return legacyNav?.type === 1
  } catch {
    return false
  }
}

function alreadyReloadedForThis(): boolean {
  return reloadedRecentlyPerStorage() || reloadedRecentlyPerNavigationTiming()
}

function tryHardReload(): boolean {
  if (alreadyReloadedForThis()) return false
  try {
    window.sessionStorage.setItem(LAST_RELOAD_KEY, String(Date.now()))
  } catch {
    // ignore — guard #2 (Navigation Timing) still applies after the reload
  }
  window.location.reload()
  return true
}

export function installChunkErrorReload(): void {
  if (installed) return
  installed = true
  window.addEventListener('vite:preloadError', (event) => {
    if (tryHardReload()) {
      // Suppress Vite's default re-throw so React Router doesn't paint the
      // error page for a frame before the reload takes over.
      event.preventDefault()
    }
    // Otherwise we've already reloaded once for this: a genuinely broken
    // chunk. Let Vite re-throw so the route's errorElement shows instead of
    // looping.
  })
}
