import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import * as dto from '@/types/dto'
import { mutate } from 'swr'
import { put } from '@/lib/fetch'
import { UserSelectorDialog } from '@/components/app/UserSelectorDialog'

interface Props {
  assistant: dto.AssistantWithOwner
  onClose: () => void
}

export const AssistantOwnerSelectorDialog = ({ assistant, onClose }: Props) => {
  const { t } = useTranslation()
  const updateOwner = async (userId: string) => {
    const url = `/api/assistants/${assistant.assistantId}/owner`
    const response = await put(url, userId)
    await mutate(url)
    await mutate('/api/assistants')
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
