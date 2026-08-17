'use client'
import { usePathname } from 'next/navigation'

// Next's `useParams()` resolves dynamic segments from the route tree baked
// into the page at build/hydration time — for a statically exported dynamic
// route (see the PageClient.tsx split under apps/frontend/app), that's just
// the single generateStaticParams() placeholder ('_'), not the real id in
// the URL, on a hard page load. `usePathname()` reads the live
// window.location instead, so segment-index extraction from it is reliable
// regardless of which static shell was served.
export function useUrlSegment(index: number): string {
  const pathname = usePathname()
  const segments = pathname.split('/').filter(Boolean)
  return decodeURIComponent(segments[index] ?? '')
}
