import { useLocation, useNavigate } from 'react-router-dom'

// Aliased over `@/lib/clientRouter` (see vite.config.ts). The real
// ChatPageContextProvider.tsx imports `useClientPathname`/`useClientNavigate`
// from that module unmodified — under Next's static export those had to be
// hand-rolled (history.pushState + a context provider) because Next's own
// router can't soft-navigate into a dynamic segment it has no build-time
// payload for (see the real file's comment). React Router doesn't have that
// limitation: its own useLocation/useNavigate already do exactly this, so
// the shim is a two-line passthrough — no ClientRouterProvider needed at all.
export function useClientPathname(): string {
  return useLocation().pathname
}

export function useClientNavigate(): (path: string) => void {
  const navigate = useNavigate()
  return (path: string) => navigate(path)
}
