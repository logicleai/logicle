import { workspaceRoles } from '@/types/workspace'
import { useTranslation } from 'next-i18next'
import React, { useState } from 'react'
import toast from 'react-hot-toast'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { post } from '@/lib/fetch'
import { mutate } from 'swr'
import { UserListSelector } from '@/components/app/UserListSelector'
import { SelectableUserDTO } from '@/types/user'

const AddMember = ({
  setVisible,
  workspaceId,
}: {
  setVisible: (visible: boolean) => void
  workspaceId: string
}) => {
  const { t } = useTranslation('common')
  const [selectedUsers, setSelectedUsers] = useState<SelectableUserDTO[]>([])

  async function onSubmit() {
    const url = `/api/workspaces/${workspaceId}/members`
    for (const user of selectedUsers) {
      window.alert(user.id)
      const response = await post(url, {
        userId: user.id,
        role: 'MEMBER',
      })
      if (response.error) {
        toast.error(response.error.message)
        return
      }
    }
    mutate(url)
    toast.success(t('member-added'))
    setVisible(false)
  }

  return (
    <Dialog open={true} onOpenChange={setVisible}>
      <DialogContent className="flex flex-col max-w-[64rem]">
        <DialogHeader>
          <DialogTitle>{t('add-member')}</DialogTitle>
        </DialogHeader>
        <UserListSelector onSelectionChange={setSelectedUsers}></UserListSelector>
        <Button onClick={() => onSubmit()}>Add users</Button>
      </DialogContent>
    </Dialog>
  )
}

export default AddMember
