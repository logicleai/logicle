import { useTranslation } from 'react-i18next'
import { useUsers } from '@/hooks/users'
import { useState } from 'react'
import ConfirmationDialog from '../ui/ConfirmationDialog'
import { Popover, PopoverContentNoPortal, PopoverTrigger } from '../ui/popover'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from '../ui/command'
import { Check, ChevronsUpDown } from 'lucide-react'

interface Props {
  initialUserId: string
  title: string
  onUpdate: (userId: string) => void
  onClose: () => void
}

export const UserSelectorDialog = ({ initialUserId, title, onUpdate, onClose }: Props) => {
  const { t } = useTranslation()
  const { data: users_ } = useUsers()
  const users = users_ || []
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState<string>(initialUserId)
  return (
    <ConfirmationDialog
      onConfirm={() => onUpdate(value)}
      confirmText={t('submit')}
      title={title}
      onCancel={onClose}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            size="body1"
            aria-expanded={open}
            className="justify-between text-body1"
          >
            {value ? users.find((user) => user.id == value)?.name : t('select_owner_placeholder')}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContentNoPortal className="text-body1 w-[--radix-popover-trigger-width] p-0">
          <Command
            filter={(value, search) => {
              if (value.includes(search)) return 1
              return 0
            }}
          >
            <CommandInput placeholder={t('search_placeholder')} />
            <CommandEmpty>{t('no_such_user')}</CommandEmpty>
            <CommandGroup className="max-h-64 overflow-x-hidden overflow-y-auto">
              {users.map((user) => (
                <CommandItem
                  key={user.id}
                  value={user.name} // We use user.name, because this is what we use for filtering
                  className="text-body1"
                  onSelect={() => {
                    setValue(user.id)
                    setOpen(false)
                  }}
                >
                  <Check
                    className={cn('mr-2 h-4 w-4', value === user.id ? 'opacity-100' : 'opacity-0')}
                  />
                  {user.name}
                </CommandItem>
              ))}
            </CommandGroup>
          </Command>
        </PopoverContentNoPortal>
      </Popover>
    </ConfirmationDialog>
  )
}
