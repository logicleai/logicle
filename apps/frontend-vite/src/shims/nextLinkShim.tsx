import { forwardRef } from 'react'
import { Link as RouterLink, type LinkProps as RouterLinkProps } from 'react-router-dom'

// Aliased over `next/link` (see vite.config.ts) — real components across the
// whole app import this unmodified (components/ui/link.tsx, EditableLink.tsx,
// dropdown-menu.tsx, ...).
interface Props extends Omit<RouterLinkProps, 'to' | 'prefetch'> {
  href: string
  // Next's is a boolean prefetch-on-hover toggle; RR's `prefetch` prop takes
  // a strategy string instead ('intent' | 'render' | 'none' | 'viewport').
  // Only ever passed `false` by real call sites here (opting out) — mapped
  // to RR's equivalent opt-out rather than dropped, so that intent survives.
  prefetch?: boolean
}

const Link = forwardRef<HTMLAnchorElement, Props>(({ href, prefetch, ...rest }, ref) => (
  <RouterLink ref={ref} to={href} prefetch={prefetch === false ? 'none' : undefined} {...rest} />
))
Link.displayName = 'NextLinkShim'

export default Link
