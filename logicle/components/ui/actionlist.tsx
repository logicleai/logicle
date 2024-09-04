import { TablerIconsProps } from '@tabler/icons-react'
import { Button } from './button'
import { IconDotsVertical } from '@tabler/icons-react'
import {
  DropdownMenu,
  DropdownMenuButton,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './dropdown-menu'

export interface Action {
  icon?: (props: TablerIconsProps) => JSX.Element
  onClick: () => void
  text: string
  disabled?: boolean
  destructive?: boolean
}

export interface ActionListProps {
  children?: never
  actions: Action[]
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
          <DropdownMenuButton
            disabled={action.disabled}
            icon={action.icon}
            onClick={action.onClick}
            key={action.text}
            variant={action.destructive ? 'destructive' : 'default'}
          >
            {action.text}
          </DropdownMenuButton>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
