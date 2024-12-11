import { WorkspaceRole } from '@/types/workspace'
import { useTranslation } from 'react-i18next'
import React, { useState } from 'react'
import toast from 'react-hot-toast'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { post } from '@/lib/fetch'
import { mutate } from 'swr'
import { UserListSelector } from '@/components/app/UserListSelector'
import * as dto from '@/types/dto'

interface Props {
  onClose: () => void
  workspaceId: string
  members: dto.WorkspaceMemberWithUser[]
}

export const AddWorkspaceMembersDialog = ({ onClose, workspaceId, members }: Props) => {
  const { t } = useTranslation()
  const [selectedUsers, setSelectedUsers] = useState<dto.User[]>([])
  const url = `/api/workspaces/${workspaceId}/members`
  async function onSubmit() {
    const response = await post(
      url,
      selectedUsers.map((user) => {
        return {
          userId: user.id,
          role: WorkspaceRole.MEMBER,
        }
      })
    )
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutate(url)
    toast.success(t('members-added'))
    onClose()
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="flex flex-col max-w-[64rem]">
        <DialogHeader>
          <DialogTitle>{t('select-members-to-add')}</DialogTitle>
        </DialogHeader>
        <UserListSelector
          onSelectionChange={setSelectedUsers}
          exclude={members.map((m) => m.userId)}
        ></UserListSelector>
        <Button onClick={() => onSubmit()}>Add users</Button>
      </DialogContent>
    </Dialog>
  )
}
