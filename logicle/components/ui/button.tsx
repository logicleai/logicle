import * as React from 'react'
//import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from 'class-variance-authority'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-primary_color text-secondary_color hover:bg-primary_color_hover',
        secondary:
          'bg-secondary_color text-primary_text_color border-[1px] border-secondary_text_color hover:bg-secondary_color_hover',
        outline: 'border border-input bg-transparent',
        ghost: 'border-none bg-transparent',
        link: 'text-primary_color underline-offset-4 underline',
        destructive_link: 'text-destructive underline-offset-4 underline',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      },
      size: {
        default: 'px-4 py-2 text-button rounded-md',
        link: 'text-link rounded-md',
        icon: 'p-1 rounded-md',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={`${buttonVariants({ variant, size })} ${className ?? ''}`}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
