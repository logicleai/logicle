import { TablerIcon } from '@tabler/icons-react'
import { Button } from './button'
import { IconDotsVertical } from '@tabler/icons-react'
import {
  DropdownMenu,
  DropdownMenuButton,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './dropdown-menu'
import { ReactElement } from 'react'
import { useTranslation } from 'react-i18next'

export interface ActionProps {
  icon?: TablerIcon
  onClick: () => void
  text: string
  disabled?: boolean
  destructive?: boolean
  visible?: boolean
}

export const Action = (props: ActionProps) => {
  return (
    <DropdownMenuButton
      visible={props.visible}
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
  children?: ReactElement<typeof Action | any>[] | ReactElement<typeof Action | false>
}

export const ActionList = ({ children }: ActionListProps) => {
  const { t } = useTranslation()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="px-1 py-1 opacity-50"
          aria-label={t('action')}
          title={t('action')}
        >
          <IconDotsVertical size={18} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>{children}</DropdownMenuContent>
    </DropdownMenu>
  )
}
