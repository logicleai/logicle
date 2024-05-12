import { useTranslation } from 'next-i18next'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUsers } from '@/hooks/users'
import { useState } from 'react'
import ConfirmationDialog from '../ui/ConfirmationDialog'

interface Props {
  initialUserId: string
  title: string
  onUpdate: (userId: string) => void
  onClose: () => void
}

export const UserSelectorDialog = ({ initialUserId, title, onUpdate, onClose }: Props) => {
  const { t } = useTranslation('common')
  const { data: users_ } = useUsers()
  const [selectedUser, setSelectedUser] = useState<string>(initialUserId)
  const users = users_ || []
  return (
    <ConfirmationDialog
      onConfirm={() => onUpdate(selectedUser)}
      confirmText={t('submit')}
      title={title}
      visible={false}
      onCancel={onClose}
    >
      <Select value={selectedUser} onValueChange={(value) => setSelectedUser(value)}>
        <SelectTrigger>
          <SelectValue placeholder={t('select_owner_placeholder')} />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            {users.map((user) => (
              <SelectItem value={user.id} key={user.id}>
                {user.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </ConfirmationDialog>
  )
}
