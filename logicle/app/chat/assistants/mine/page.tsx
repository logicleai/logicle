'use client'
import { Avatar } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { UserAssistant } from '@/types/chat'
import { useRouter } from 'next/navigation'
import { useSWRJson } from '@/hooks/swr'
import { WithLoadingAndError } from '@/components/ui'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { IconEdit, IconSettings, IconTrash } from '@tabler/icons-react'
import { DEFAULT_TEMPERATURE } from '@/lib/const'
import { delete_, post } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { useBackends } from '@/hooks/backends'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { MainLayout } from '@/app/layouts/MainLayout'
import { Chatbar } from '../../components/chatbar/Chatbar'
import { ActionList } from '@/components/ui/actionlist'

const EMPTY_ASSISTANT_NAME = ''

const describeSharing = (assistant: UserAssistant) => {
  for (const sharing of assistant.sharing) {
    if (sharing.type == 'all') return 'Company'
  }
  for (const sharing of assistant.sharing) {
    if (sharing.type == 'workspace') return 'Workspace'
  }
  return 'Only me'
}

const MyAssistantPage = () => {
  const { t } = useTranslation('common')
  const router = useRouter()
  const profile = useUserProfile()
  const modalContext = useConfirmationContext()

  const isMine = (assistant, profile) => {
    return assistant.owner == profile?.id
  }

  const {
    data: assistants,
    isLoading,
    error,
  } = useSWRJson<UserAssistant[]>(`/api/user/assistants/explore`)
  const { data: backends } = useBackends()
  const defaultBackend = backends && backends.length > 0 ? backends[0].id : undefined

  const onCreateAssistant = async () => {
    const newAssistant = {
      icon: null,
      description: '',
      name: EMPTY_ASSISTANT_NAME,
      backendId: defaultBackend,
      model: '',
      systemPrompt: '',
      tokenLimit: 4000,
      temperature: DEFAULT_TEMPERATURE,
      tools: [], // TODO: load available tools from backend
      files: [],
    }
    const url = `/api/assistants`
    const response = await post<dto.SelectableAssistantWithOwner>(url, newAssistant)

    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutate(url)
    mutate('/api/user/profile') // Let the chat know that there are new assistants!
    router.push(`/assistants/${response.data.id}`)
  }

  const onEdit = (assistant: UserAssistant) => {
    router.push(`/assistants/${assistant.id}`)
  }

  async function onDelete(assistant: UserAssistant) {
    const result = await modalContext.askConfirmation({
      title: `${t('remove-assistant')} ${assistant.name}`,
      message: t('remove-assistant-confirmation'),
      confirmMsg: t('remove-assistant'),
    })
    if (!result) return

    const response = await delete_(`/api/assistants/${assistant.id}`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutate('/api/assistants')
    mutate('/api/user/profile')
    mutate('/api/user/assistants/explore')
    toast.success(t('assistant-deleted'))
  }

  const haveDrafts =
    assistants?.find(
      (assistant) => assistant.owner == profile?.id && assistant.name == EMPTY_ASSISTANT_NAME
    ) !== undefined

  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      <div className="flex flex-1 flex-col gap-2">
        <div className="flex flex-row gap-2 justify-end">
          <Button disabled={haveDrafts} onClick={() => onCreateAssistant()} variant="primary">
            {t('create_new')}
          </Button>
        </div>
        <h1 className="p-8 text-center">{t('my_assistants')}</h1>
        <ScrollArea className="flex-1">
          <div className="max-w-[960px] w-3/4 m-auto gap-4 flex flex-col">
            {(assistants ?? [])
              .filter((assistant) => isMine(assistant, profile))
              .map((assistant) => {
                return (
                  <div className="flex group align-center gap-2 items-center">
                    <Avatar
                      className="shrink-0 self-center"
                      size="big"
                      url={assistant.icon ?? undefined}
                      fallback={assistant.name}
                    />
                    <div className="flex flex-col flex-1 h-full">
                      <div className="font-bold">{assistant.name}</div>
                      <div className="opacity-50 overflow-hidden text-ellipsis line-clamp-2">
                        {assistant.description}
                      </div>
                    </div>
                    <div className="">{describeSharing(assistant)}</div>
                    <ActionList
                      actions={[
                        {
                          icon: IconEdit,
                          onClick: () => {
                            onEdit(assistant)
                          },
                          text: t('edit'),
                        },
                        {
                          icon: IconTrash,
                          onClick: () => onDelete(assistant),
                          text: t('delete'),
                          destructive: true,
                        },
                      ]}
                    />
                  </div>
                )
              })}
          </div>
        </ScrollArea>
      </div>
    </WithLoadingAndError>
  )
}

const MyAssistantPageWithToolbars = () => {
  return (
    <MainLayout leftBar={<Chatbar />}>
      <MyAssistantPage></MyAssistantPage>
    </MainLayout>
  )
}

export default MyAssistantPageWithToolbars
