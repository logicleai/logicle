import { TablerIcon } from '@tabler/icons-react'
import { Button } from './button'
import { IconDotsVertical } from '@tabler/icons-react'
import {
  DropdownMenu,
  DropdownMenuButton,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './dropdown-menu'
import { ReactElement, useEffect, useState } from 'react'
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
  disabled?: boolean
}

export const ActionList = ({ children, disabled = false }: ActionListProps) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])
  return (
    <DropdownMenu open={open && !disabled} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="px-1 py-1 opacity-50 disabled:!opacity-20"
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
