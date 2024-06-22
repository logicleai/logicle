import { workspaceRoles } from '@/types/workspace'
import { useTranslation } from 'next-i18next'
import { mutate } from 'swr'
import { patch } from '@/lib/fetch'
import toast from 'react-hot-toast'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useState } from 'react'

interface UpdateMemberRoleProps {
  onClose: () => void
  workspaceId: string
  member: dto.WorkspaceMember
}

export const UpdateMemberRoleDialog = ({ workspaceId, member, onClose }: UpdateMemberRoleProps) => {
  const { t } = useTranslation('common')
  const [role, setRole] = useState<string>(member.role)
  const updateRole = async () => {
    const mutateUrl = `/api/workspaces/${workspaceId}/members`
    const url = `/api/workspaces/${workspaceId}/members/${member.userId}`
    const response = await patch(url, {
      role,
    })
    mutate(mutateUrl)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    onClose()
    toast.success(t('member-role-updated'))
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader className="font-bold">{t('select_role')}</DialogHeader>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger>
            <SelectValue placeholder={t('select_role_placeholder')} />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {workspaceRoles.map((role) => (
                <SelectItem value={role} key={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        <div>
          <Button onClick={() => updateRole()}>change role</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
