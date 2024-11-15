import { TablerIconsProps } from '@tabler/icons-react'
import { Button } from './button'
import { IconDotsVertical } from '@tabler/icons-react'
import {
  DropdownMenu,
  DropdownMenuButton,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './dropdown-menu'
import { ReactElement } from 'react'

export interface Action {
  icon?: (props: TablerIconsProps) => JSX.Element
  onClick: () => void
  text: string
  disabled?: boolean
  destructive?: boolean
}

export const Action2 = (props: Action) => {
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
  children?: never
  actions: Action[]
}

export interface ActionList2Props {
  children?: ReactElement<typeof Action2>[] | ReactElement<typeof Action2>
}

export const ActionList = ({ actions }: ActionListProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="px-1 py-1 opacity-50">
          <IconDotsVertical size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {actions.map((action) => (
          <Action2 {...action} key={action.text}></Action2>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const ActionList2 = ({ children }: ActionList2Props) => {
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
