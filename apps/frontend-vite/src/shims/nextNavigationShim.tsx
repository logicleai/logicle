import { useLocation, useNavigate, useSearchParams as useRRSearchParams } from 'react-router-dom'
import { useMemo } from 'react'

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
  return useMemo(
    () => ({
      push: (href: string) => void navigate(href),
      replace: (href: string) => void navigate(href, { replace: true }),
      back: () => void navigate(-1),
      refresh: () => {},
    }),
    [navigate]
  )
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
