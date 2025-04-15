import * as React from 'react'
//import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'
import { TablerIcon } from '@tabler/icons-react'

const menuVariants = cva('flex flex-col', {
  variants: {
    variant: {
      default: '',
    },
    size: {
      default: 'px-2 py-2 gap-2 font-medium text-sm',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
})

export interface MenuProps
  extends React.ButtonHTMLAttributes<HTMLDivElement>,
    VariantProps<typeof menuVariants> {
  asChild?: boolean
  children: React.ReactNode
}

const Menu = ({ className, variant, size, children }: MenuProps) => {
  return <div className={cn(menuVariants({ variant, size, className }))}>{children}</div>
}

export interface MenuItemProps {
  icon?: TablerIcon
  onClick: () => void
  children: string
  className?: string
  disabled?: boolean
}

const MenuItem = ({ icon, onClick, children, className, disabled }: MenuItemProps) => {
  const Icon = icon
  return (
    <button
      disabled={disabled ?? false}
      onClick={onClick}
      className={cn('text-left flex', className)}
    >
      {Icon && <Icon></Icon>}
      {children}
    </button>
  )
}
//menu.displayName = 'menu'

export { Menu, MenuItem, menuVariants }
