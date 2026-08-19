
import { default as NextLink } from 'next/link'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/frontend/lib/utils'
import LetterAvatar from './LetterAvatar'
import { TablerIcon } from '@tabler/icons-react'

const linkVariants = cva(
  'inline-flex whitespace-nowrap rounded-md ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'text-primary underline-offset-4 underline',
        ghost: 'border-none bg-transparent',
        sidebar_active: 'text-primary underline-offset-4 bg-secondary-hover',
      },
      size: {
        default: 'text-link',
        inline: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
)

interface Params extends VariantProps<typeof linkVariants> {
  href: string
  icon?: TablerIcon
  iconSize?: number
  children: string
  className?: string
  // Under static export, a link to a dynamic segment (an id only known at
  // runtime) can never have a pre-baked navigation payload. Next's <Link>
  // still intercepts the click and attempts a client-side transition first,
  // unmounting the current page before it discovers it has to fall back to
  // a hard navigation — that unmount is what shows as a blank flash. Pass
  // `native` for those links so the click goes through a plain <a> instead:
  // no Next router involvement, so the browser keeps the current page
  // painted (its normal loading behavior) until the new one is ready.
  native?: boolean
}

const Link = ({ href, children, variant, size, className, icon, iconSize, native }: Params) => {
  const Icon = icon
  const linkClassName = `${linkVariants({ variant, size })} ${className ?? ''}`
  if (native) {
    return (
      <a href={href} className={linkClassName}>
        {Icon && <Icon size={iconSize ?? 18} />}
        {children}
      </a>
    )
  }
  return (
    <NextLink href={href} className={linkClassName}>
      {Icon && <Icon size={iconSize ?? 18} />}
      {children}
    </NextLink>
  )
}

const AvatarLink = ({ href, children, variant, size, native }: Params) => {
  const avatarClassName = cn(linkVariants({ variant, size }), 'items-center gap-2')
  if (native) {
    return (
      <a href={href} className={avatarClassName}>
        <LetterAvatar name={children} />
        <span className="justify-center">{children}</span>
      </a>
    )
  }
  return (
    <NextLink href={href} className={avatarClassName}>
      <LetterAvatar name={children} />
      <span className="justify-center">{children}</span>
    </NextLink>
  )
}

Link.displayName = 'Link'

export { Link, AvatarLink }
