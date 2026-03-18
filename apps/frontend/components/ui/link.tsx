
import { default as NextLink } from 'next/link'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'
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
}

const Link = ({ href, children, variant, size, className, icon, iconSize }: Params) => {
  const Icon = icon
  return (
    <NextLink href={href} className={`${linkVariants({ variant, size })} ${className ?? ''}`}>
      {Icon && <Icon size={iconSize ?? 18} />}
      {children}
    </NextLink>
  )
}

const AvatarLink = ({ href, children, variant, size }: Params) => {
  return (
    <NextLink href={href} className={cn(linkVariants({ variant, size }), 'items-center gap-2')}>
      <LetterAvatar name={children} />
      <span className="justify-center">{children}</span>
    </NextLink>
  )
}

Link.displayName = 'Link'

export { Link, AvatarLink }
