import { useLocation, useNavigate } from 'react-router-dom'

// Aliased over `next/navigation` (see vite.config.ts) so real app code —
// ported here unmodified, e.g. AssistantDropdown.tsx/Chatbar.tsx if a real
// port grows to include them — keeps working against React Router instead.
// Only the subset actually exercised by the chat tree is implemented.
export function useRouter() {
  const navigate = useNavigate()
  return {
    push: (href: string) => navigate(href),
    replace: (href: string) => navigate(href, { replace: true }),
    back: () => navigate(-1),
    refresh: () => {},
  }
}

export function usePathname(): string {
  return useLocation().pathname
}

// next/navigation's redirect() is a throw-based signal meant for React
// Server Components; the one call site in this app that survives into the
// spike (ChatSection's missing-api-key redirect) only ever runs client-side,
// where Next's own implementation degrades to a plain navigation anyway.
export function redirect(url: string): never {
  window.location.assign(url)
  throw new Error(`NEXT_REDIRECT:${url}`)
}
