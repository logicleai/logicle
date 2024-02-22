import { availableRoles } from '@/types/team'
import { Team } from '@/types/db'
import { useTranslation } from 'next-i18next'
import { mutate } from 'swr'
import { patch } from '@/lib/fetch'
import { TeamMemberDTO } from '@/types/team'
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
  team: Team
  member: TeamMemberDTO
}

const UpdateMemberRole = ({ team, member }: UpdateMemberRoleProps) => {
  const { t } = useTranslation('common')

  const updateRole = async (member: TeamMemberDTO, role: string) => {
    const url = `/api/teams/${team.slug}/members`
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
          {availableRoles.map((role) => (
            <SelectItem value={role.name} key={role.id}>
              {role.name}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  )
}

export default UpdateMemberRole
