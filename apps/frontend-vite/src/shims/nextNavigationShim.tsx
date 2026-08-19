import { useLocation, useNavigate, useSearchParams as useRRSearchParams } from 'react-router-dom'

// Aliased over `next/navigation` (see vite.config.ts) — real app code is
// imported unmodified across the whole app (not just chat), so this covers
// every hook actually used anywhere in apps/frontend (verified via
// `grep -rn "from 'next/navigation'" apps/frontend`).
interface NextRouterShim {
  push: (href: string) => void
  replace: (href: string) => void
  back: () => void
  refresh: () => void
}

export function useRouter(): NextRouterShim {
  const navigate = useNavigate()
  return {
    push: (href: string) => void navigate(href),
    replace: (href: string) => void navigate(href, { replace: true }),
    back: () => void navigate(-1),
    refresh: () => {},
  }
}

export function usePathname(): string {
  return useLocation().pathname
}

// Next's useSearchParams() returns a read-only URLSearchParams; React
// Router's hook of the same name returns [URLSearchParams, setter] — this
// drops the setter to match the shape call sites actually use (only reads).
export function useSearchParams(): URLSearchParams {
  const [params] = useRRSearchParams()
  return params
}

// next/navigation's redirect() is a throw-based signal meant for React
// Server Components; the one call site in this app that survives into the
// spike (ChatSection's missing-api-key redirect) only ever runs client-side,
// where Next's own implementation degrades to a plain navigation anyway.
export function redirect(url: string): never {
  window.location.assign(url)
  throw new Error(`NEXT_REDIRECT:${url}`)
}
