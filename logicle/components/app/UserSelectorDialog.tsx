import { useTranslation } from 'next-i18next'
import { useUsers } from '@/hooks/users'
import { useState } from 'react'
import ConfirmationDialog from '../ui/ConfirmationDialog'
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover'
import { Button } from '../ui/button'
import { cn } from '@/lib/utils'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '../ui/command'
import { Check, ChevronsUpDown } from 'lucide-react'

interface Props {
  initialUserId: string
  title: string
  onUpdate: (userId: string) => void
  onClose: () => void
}

export const UserSelectorDialog = ({ initialUserId, title, onUpdate, onClose }: Props) => {
  const { t } = useTranslation('common')
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
        <PopoverContent className="text-body1 w-[--radix-popover-trigger-width] p-0">
          <Command>
            <CommandInput placeholder="Search user..." />
            <CommandEmpty>{t('no_such_user')}</CommandEmpty>
            <CommandList>
              {users.map((user) => (
                <CommandItem
                  key={user.id}
                  value={user.id}
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
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </ConfirmationDialog>
  )
}
