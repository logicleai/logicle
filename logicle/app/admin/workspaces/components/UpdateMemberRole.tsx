import { WorkspaceMemberDTO, workspaceRoles } from '@/types/workspace'
import { Workspace } from '@/types/db'
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

interface UpdateMemberRoleProps {
  workspace: Workspace
  member: WorkspaceMemberDTO
}

const UpdateMemberRole = ({ workspace, member }: UpdateMemberRoleProps) => {
  const { t } = useTranslation('common')

  const updateRole = async (member: WorkspaceMemberDTO, role: string) => {
    const url = `/api/workspaces/${workspace.slug}/members`
    const response = await patch(url, {
      memberId: member.userId,
      role,
    })
    mutate(url)
    if (response.error) {
      toast.error(response.error.message)
      return
    }

    toast.success(t('member-role-updated'))
  }

  return (
    <Select value={member.role} onValueChange={(value) => updateRole(member, value)}>
      <SelectTrigger>
        <SelectValue placeholder={t('create_assistant_field_select_backend_placeholder')} />
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
  )
}

export default UpdateMemberRole
