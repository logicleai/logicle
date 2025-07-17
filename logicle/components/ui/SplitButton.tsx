import * as React from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { Button } from './button'
import { ChevronDownIcon } from '@radix-ui/react-icons'

type Props = {
  primary: React.ReactElement
  children: React.ReactNode
}

export function SplitButton({ primary, children }: Props) {
  return (
    <DropdownMenu.Root>
      <div className="inline-flex rounded-md shadow-sm border overflow-hidden">
        <Button className="rounded-none">{primary}</Button>
        <DropdownMenu.Trigger asChild>
          <Button
            variant="outline"
            size="icon"
            className="rounded-none border-l"
            aria-label="Toggle menu"
          >
            <ChevronDownIcon />
          </Button>
        </DropdownMenu.Trigger>
      </div>

      <DropdownMenu.Portal>
        <DropdownMenu.Content side="bottom" align="end" className="bg-white rounded-md shadow p-1">
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
