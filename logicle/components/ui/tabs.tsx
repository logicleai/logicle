import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'

import { cn } from '@/lib/utils'

import { cva, type VariantProps } from 'class-variance-authority'

const tabListVariants = cva('', {
  variants: {
    direction: {
      vertical: 'flex flex-col h-10 items-stretch rounded-md p-1 gap-2 text-muted-foreground',
      horizontal:
        'inline-flex h-10 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground',
    },
  },
  defaultVariants: {
    direction: 'horizontal',
  },
})

const tabTriggerVariants = cva(
  'inline-flex items-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      direction: {
        vertical:
          'justify-left data-[state=active]:bg-secondary_color_hover data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        horizontal:
          'justify-center data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-sm',
      },
    },
    defaultVariants: {
      direction: 'horizontal',
    },
  }
)

const Tabs = TabsPrimitive.Root

export interface TabsListProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>,
    VariantProps<typeof tabListVariants> {}

const TabsList = React.forwardRef<React.ElementRef<typeof TabsPrimitive.List>, TabsListProps>(
  ({ className, direction, children, ...props }, ref) => (
    <TabsPrimitive.List
      ref={ref}
      className={cn(tabListVariants({ direction }), className)}
      children={React.Children.map(children, (child) => {
        return React.cloneElement(child as any, { direction })
      })}
      {...props}
    />
  )
)
TabsList.displayName = TabsPrimitive.List.displayName

export interface TabTriggerProps
  extends React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>,
    VariantProps<typeof tabTriggerVariants> {}

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  TabTriggerProps
>(({ className, direction, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(tabTriggerVariants({ direction }), className)}
    {...props}
  />
))
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      'mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
      className
    )}
    {...props}
  />
))
TabsContent.displayName = TabsPrimitive.Content.displayName

export { Tabs, TabsList, TabsTrigger, TabsContent }
