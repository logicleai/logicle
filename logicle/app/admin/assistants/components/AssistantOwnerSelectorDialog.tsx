import { useTranslation } from 'next-i18next'
import toast from 'react-hot-toast'
import * as dto from '@/types/dto'
import { mutate } from 'swr'
import { patch } from '@/lib/fetch'
import { UserSelectorDialog } from '@/components/app/UserSelectorDialog'

interface Props {
  assistant: dto.SelectableAssistantWithOwner
  onClose: () => void
}

export const AssistantOwnerSelectorDialog = ({ assistant, onClose }: Props) => {
  const { t } = useTranslation('common')
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
    onClose()
    toast.success(t('assistant-owner-updated'))
  }
  return (
    <UserSelectorDialog
      initialUserId={assistant.owner ?? ''}
      title={t('select_assistant_owner')}
      onClose={onClose}
      onUpdate={updateOwner}
    ></UserSelectorDialog>
  )
}
