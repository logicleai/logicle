import { TablerIcon } from '@tabler/icons-react'
import { Button } from './button'
import { IconDotsVertical } from '@tabler/icons-react'
import {
  DropdownMenu,
  DropdownMenuButton,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './dropdown-menu'
import React, { ReactElement } from 'react'

export interface ActionProps {
  icon?: TablerIcon
  onClick: () => void
  text: string
  disabled?: boolean
  destructive?: boolean
}

export const Action = (props: ActionProps) => {
  return (
    <DropdownMenuButton
      disabled={props.disabled}
      icon={props.icon}
      onClick={props.onClick}
      key={props.text}
      variant={props.destructive ? 'destructive' : 'default'}
    >
      {props.text}
    </DropdownMenuButton>
  )
}

export interface ActionListProps {
  children?: ReactElement<typeof Action>[] | ReactElement<typeof Action>
}

export const ActionList = ({ children }: ActionListProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="px-1 py-1 opacity-50">
          <IconDotsVertical size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}
