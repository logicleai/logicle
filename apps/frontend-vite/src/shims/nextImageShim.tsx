import { forwardRef, type ImgHTMLAttributes } from 'react'

// Aliased over `next/image` (see vite.config.ts). No image optimizer route
// exists here either way — next.config.ts already sets `images.unoptimized`
// for the same reason under `output: 'export'` — so a plain <img> is exactly
// equivalent, not a downgrade.
interface Props extends ImgHTMLAttributes<HTMLImageElement> {
  src: string
  alt: string
  unoptimized?: boolean
  priority?: boolean
  fill?: boolean
}

const Image = forwardRef<HTMLImageElement, Props>(
  ({ alt, unoptimized: _unoptimized, priority: _priority, fill: _fill, ...rest }, ref) => (
    <img ref={ref} alt={alt} {...rest} />
  )
)
Image.displayName = 'NextImageShim'

export default Image
