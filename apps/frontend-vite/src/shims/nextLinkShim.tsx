import { forwardRef } from 'react'
import { Link as RouterLink, type LinkProps as RouterLinkProps } from 'react-router-dom'

// Aliased over `next/link` (see vite.config.ts) for any real component
// pulled in transitively that still imports it (e.g. components/ui/link.tsx
// isn't ported here yet, but components/ui/dropdown-menu.tsx or
// EditableLink.tsx might be via a leaf chat component).
interface Props extends Omit<RouterLinkProps, 'to'> {
  href: string
}

const Link = forwardRef<HTMLAnchorElement, Props>(({ href, ...rest }, ref) => (
  <RouterLink ref={ref} to={href} {...rest} />
))
Link.displayName = 'NextLinkShim'

export default Link
