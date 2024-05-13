import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { TablerIconsProps } from '@tabler/icons-react'
import { Button } from './button'
import { IconDotsVertical } from '@tabler/icons-react'
import { Menu, MenuItem } from './menu'

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
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="px-1 py-1 opacity-50">
          <IconDotsVertical size={18} />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <Menu>
          {actions.map((action) => (
            <MenuItem
              disabled={action.disabled}
              icon={action.icon}
              onClick={action.onClick}
              key={action.text}
              className={action.destructive ? 'text-destructive' : ''}
            >
              {action.text}
            </MenuItem>
          ))}
        </Menu>
      </PopoverContent>
    </Popover>
  )
}
