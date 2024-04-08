import { useTranslation } from 'next-i18next'
import toast from 'react-hot-toast'
import * as dto from '@/types/dto'
import { WorkspaceMemberDTO, workspaceRoles } from '@/types/workspace'
import useSWR, { mutate } from 'swr'
import { patch, put } from '@/lib/fetch'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useUsers } from '@/hooks/users'

interface Props {
  assistant: dto.SelectableAssistantWithOwner
}

const AssistantOwnerSelector = ({ assistant }: Props) => {
  const { t } = useTranslation('common')
  const { data: users_ } = useUsers()
  const users = users_ || []
  const updateOwner = async (userId: string) => {
    const url = `/api/assistants/${assistant.id}`
    const response = await patch(url, {
      owner: userId,
    } as Partial<dto.InsertableAssistant>)
    mutate(url)
    mutate('/api/assistants')
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    toast.success(t('assistant-owner-updated'))
  }

  return (
    <Select value={assistant.owner ?? undefined} onValueChange={(value) => updateOwner(value)}>
      <SelectTrigger>
        <SelectValue placeholder={t('create_assistant_field_select_backend_placeholder')} />
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
  )
}

export default AssistantOwnerSelector
