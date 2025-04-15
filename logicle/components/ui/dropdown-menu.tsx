import * as React from 'react'
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'

import { cn } from '@/lib/utils'
import { IconCheck, IconProps } from '@tabler/icons-react'
import Link from 'next/link'
import { VariantProps, cva } from 'class-variance-authority'

const menuItemVariants = cva(
  'flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50',
  {
    variants: {
      variant: {
        default: '',
        destructive: 'text-alert hover:text-alert focus:text-alert ',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

const DropdownMenu = DropdownMenuPrimitive.Root

const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger

const DropdownMenuPortal = DropdownMenuPrimitive.Portal

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        'z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 text-link',
        className
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

export interface DropdownMenuButtonProps {
  icon?: (props: IconProps) => React.ReactNode
  onClick?: () => void
  children: string
  variant?: VariantProps<typeof menuItemVariants>['variant']
  disabled?: boolean
  checked?: boolean
}

const DropdownMenuButton = ({
  icon,
  onClick,
  disabled,
  variant,
  checked,
  children,
}: DropdownMenuButtonProps) => {
  const Icon = icon
  return (
    <DropdownMenuPrimitive.Item
      disabled={disabled}
      className={cn(menuItemVariants({ variant }))}
      onClick={onClick}
    >
      {Icon && <Icon />}
      {checked == undefined ? undefined : <IconCheck opacity={checked ? 1 : 0} />}
      {children}
    </DropdownMenuPrimitive.Item>
  )
}

export interface DropdownMenuLinkProps {
  icon?: (props: IconProps) => React.ReactNode
  href: string
  children: string
  variant?: VariantProps<typeof menuItemVariants>['variant']
}

DropdownMenuButton.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuLink = ({ icon, href, children, variant }: DropdownMenuLinkProps) => {
  const Icon = icon
  return (
    <DropdownMenuPrimitive.Item className={cn(menuItemVariants({ variant }))}>
      <Link href={href} className="flex items-center">
        {Icon && <Icon />}
        <div className="flex-1">{children}</div>
      </Link>
    </DropdownMenuPrimitive.Item>
  )
}

DropdownMenuLink.displayName = DropdownMenuPrimitive.Item.displayName

const DropdownMenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator
    ref={ref}
    className={cn('-mx-1 my-1 h-px bg-muted', className)}
    {...props}
  />
))
DropdownMenuSeparator.displayName = DropdownMenuPrimitive.Separator.displayName

export {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuButton,
  DropdownMenuLink,
  DropdownMenuSeparator,
  DropdownMenuPortal,
}
