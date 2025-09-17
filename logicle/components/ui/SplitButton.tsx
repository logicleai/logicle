import * as React from 'react'
// Choose your icon set: Tabler shown here; Lucide also works if you prefer
import {
  IconChevronDown,
  IconLoader2,
  IconPlus,
  IconPencil,
  IconTrash,
  Icon,
  IconHome,
} from '@tabler/icons-react'
// If using lucide-react instead, uncomment the line below to alias names consistently:
// import { ChevronDown as IconChevronDown, Loader2 as IconLoader2, Plus as IconPlus, Pencil as IconPencil, Trash2 as IconTrash } from "lucide-react";
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

/**
 * SplitButton (shadcn + Radix)
 * ---------------------------------
 * A two-part button: primary action on the left, dropdown trigger on the right.
 *
 * - Fully typed
 * - Supports shadcn Button variants & sizes
 * - Loading and disabled states
 * - Optional item icons, shortcuts, separators, and destructive style
 * - Accessible labels and keyboard-friendly
 */

type IconType = typeof IconHome

export type SplitButtonItem = {
  /** Visible label for the menu item */
  label: React.ReactNode
  /** Callback fired on selection */
  onSelect?: () => void
  /** If provided, item renders as an anchor */
  href?: string
  /** Optional leading icon (Tabler, Lucide, or any React component) */
  icon?: IconType
  /** Render with a destructive style */
  destructive?: boolean
  /** Disable this item */
  disabled?: boolean
  /** Optional right-aligned shortcut text (e.g., ⌘K) */
  shortcut?: string
  /** Insert a separator line before this item */
  separatorBefore?: boolean
  /** Insert a separator line after this item */
  separatorAfter?: boolean
}

export type SplitButtonProps = {
  /** Left-half button content (text or node) */
  label: React.ReactNode
  /** Primary click handler */
  onClick?: () => void
  /** Dropdown items */
  items: SplitButtonItem[]
  /** shadcn Button variant */
  variant?: React.ComponentProps<typeof Button>['variant']
  /** shadcn Button size */
  size?: React.ComponentProps<typeof Button>['size']
  /** Disable the entire control */
  disabled?: boolean
  /** Show a spinner on the primary half */
  loading?: boolean
  /** Align the dropdown menu */
  align?: 'start' | 'center' | 'end'
  /** Optional className for the wrapper */
  className?: string
  /** Optional aria-label for the dropdown trigger */
  triggerLabel?: string
}

export function SplitButton({
  label,
  onClick,
  items,
  //variant = 'default',
  size = 'default',
  disabled,
  loading,
  align = 'end',
  className,
  triggerLabel = 'More options',
}: SplitButtonProps) {
  return (
    <div className={cn('inline-flex isolate rounded-md shadow-sm', className)}>
      {/* Primary half */}
      <Button
        type="button"
        onClick={onClick}
        //variant={variant}
        size={size}
        disabled={disabled || loading}
        className={cn(
          // Make it look connected to the chevron half
          'rounded-r-none',
          // Ensure consistent height even when loading
          loading ? 'cursor-wait' : null
        )}
      >
        {loading && <IconLoader2 aria-hidden size={16} className="mr-2 h-4 w-4 animate-spin" />}
        {label}
      </Button>

      {/* Dropdown half */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            //variant={variant}
            size={size}
            disabled={disabled}
            aria-label={triggerLabel}
            className={cn(
              // Visually connect to the left half
              'rounded-l-none px-2',
              // Slight visual feedback when menu is open (shadcn supports data-[state=open])
              'data-[state=open]:bg-accent data-[state=open]:text-accent-foreground'
            )}
          >
            <IconChevronDown size={16} className="h-4 w-4" aria-hidden />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-56">
          {/* Optional heading if you want — left here as a pattern example */}
          {/* <DropdownMenuLabel>Actions</DropdownMenuLabel>
          <DropdownMenuSeparator /> */}

          {items.map((item, idx) => {
            const {
              label,
              onSelect,
              href,
              icon: Icon,
              destructive,
              disabled,
              shortcut,
              separatorBefore,
              separatorAfter,
            } = item

            const content = (
              <DropdownMenuItem
                key={`item-${idx}`}
                onSelect={(e) => {
                  // Let links handle navigation by themselves
                  if (href) return
                  // Radix calls onSelect on keyboard & click; prevent menu close handling from blocking
                  onSelect?.()
                }}
                disabled={disabled}
                className={cn(
                  destructive && 'text-destructive focus:text-destructive',
                  'flex',
                  Icon
                )}
              >
                {Icon ? <Icon color="black" size={20} aria-hidden /> : null}
                <span>{label}</span>
                {shortcut ? (
                  <span className="ml-auto text-xs tracking-wider opacity-60">{shortcut}</span>
                ) : null}
              </DropdownMenuItem>
            )

            return (
              <React.Fragment key={idx}>
                {separatorBefore && <DropdownMenuSeparator />}
                {href ? (
                  // Render as anchor while preserving shadcn styles
                  <a href={href} target="_self" rel="noreferrer" className="no-underline">
                    {content}
                  </a>
                ) : (
                  content
                )}
                {separatorAfter && <DropdownMenuSeparator />}
              </React.Fragment>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
