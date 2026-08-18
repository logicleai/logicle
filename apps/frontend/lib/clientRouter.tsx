'use client'
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react'

// A minimal, app-wide replacement for next/navigation's client-side
// navigation for internal links. Next's App Router navigates by fetching a
// prefetch/RSC payload for the target route and patching the tree with it —
// under `output: 'export'` (see next.config.ts) there is no server left to
// generate that payload for anything not known at build time, so any
// dynamic-segment route (chat id, user id, ...) always misses and Next
// falls back to a full page reload (see staticFrontend.ts's `/__next.`
// 404 short-circuit for where that fallback gets triggered). That's a full
// DOM teardown/rebuild with nothing rendered until every startup API call
// resolves — visible as a blank white flash on every such navigation.
//
// This provider tracks the current pathname as plain client state instead,
// updated either by browser back/forward (popstate) or by calling
// `navigate()`, which only does `history.pushState` — no fetch, no
// teardown. Pages read the current path with `useClientPathname()` instead
// of `usePathname()`/`useParams()`, and derive whatever id they need from
// it (see ChatPageContextProvider's chatIdFromPathname for the pattern).
// The app's own React tree never unmounts across these navigations.
//
// Only use this for navigation within an already-mounted part of the app
// that's been migrated to read the pathname this way (currently: chat).
// Next's <Link>/router.push are still correct for any route that hasn't
// been, and for routes with no dynamic segment (those DO have a real
// prefetch payload and navigate smoothly through Next already).
interface ClientRouterContextValue {
  pathname: string
  navigate: (path: string) => void
}

const ClientRouterContext = createContext<ClientRouterContextValue | undefined>(undefined)

export const ClientRouterProvider = ({ children }: { children: ReactNode }) => {
  const [pathname, setPathname] = useState<string>(() =>
    typeof window === 'undefined' ? '' : window.location.pathname
  )

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname)
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const navigate = useCallback((path: string) => {
    if (window.location.pathname !== path) {
      window.history.pushState(null, '', path)
    }
    setPathname(path)
  }, [])

  return (
    <ClientRouterContext.Provider value={{ pathname, navigate }}>
      {children}
    </ClientRouterContext.Provider>
  )
}

function useClientRouter(): ClientRouterContextValue {
  const value = useContext(ClientRouterContext)
  if (!value) {
    throw new Error('useClientRouter/useClientPathname must be used within a ClientRouterProvider')
  }
  return value
}

export function useClientPathname(): string {
  return useClientRouter().pathname
}

export function useClientNavigate(): (path: string) => void {
  return useClientRouter().navigate
}
