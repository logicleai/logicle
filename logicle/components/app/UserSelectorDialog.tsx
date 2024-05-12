import { useTranslation } from 'next-i18next'
import toast from 'react-hot-toast'
import * as dto from '@/types/dto'
import { mutate } from 'swr'
import { patch } from '@/lib/fetch'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUsers } from '@/hooks/users'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'
import { useState } from 'react'
import { Button } from '../ui/button'

interface Props {
  initialUserId: string
  onUpdate: (userId: string) => void
  onClose: () => void
}

export const UserSelectorDialog = ({ initialUserId, onUpdate, onClose }: Props) => {
  const { t } = useTranslation('common')
  const { data: users_ } = useUsers()
  const [selectedUser, setSelectedUser] = useState<string>(initialUserId)
  const users = users_ || []
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('select_assistant_owner')}</DialogTitle>
        </DialogHeader>
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
        <div className="flex justify-center">
          <Button onClick={() => onUpdate(selectedUser)}>Submit</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
