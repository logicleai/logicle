'use client'
import { Avatar } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useRouter } from 'next/navigation'
import { useSWRJson } from '@/hooks/swr'
import { WithLoadingAndError } from '@/components/ui'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { IconCopy, IconEdit, IconTrash } from '@tabler/icons-react'
import { DEFAULT_TEMPERATURE } from '@/lib/const'
import { delete_, get, post } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { useBackends } from '@/hooks/backends'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { MainLayout } from '@/app/layouts/MainLayout'
import { Chatbar } from '../../components/chatbar/Chatbar'
import { ActionList } from '@/components/ui/actionlist'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { useState } from 'react'

const EMPTY_ASSISTANT_NAME = ''

const describeSharing = (assistant: dto.UserAssistant) => {
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
  const [searchTerm, setSearchTerm] = useState<string>('')

  const isMine = (assistant, profile) => {
    return assistant.owner == profile?.id
  }

  const {
    data: assistants,
    isLoading,
    error,
  } = useSWRJson<dto.UserAssistant[]>(`/api/user/assistants/explore`)
  const { data: backends } = useBackends()
  const defaultBackend = backends && backends.length > 0 ? backends[0].id : undefined

  const filterWithSearch = (assistant: dto.UserAssistant) => {
    return searchTerm.trim().length == 0 || assistant.name.includes(searchTerm)
  }

  const onCreateNew = async () => {
    const newAssistant = {
      description: '',
      name: EMPTY_ASSISTANT_NAME,
      backendId: defaultBackend,
      model: '',
      systemPrompt: '',
      tokenLimit: 16000,
      temperature: DEFAULT_TEMPERATURE,
      tools: [],
      files: [],
      iconUri: null,
      owner: null,
    } as dto.InsertableAssistant
    const url = `/api/assistants`
    const response = await post<dto.AssistantWithOwner>(url, newAssistant)

    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutate(url)
    mutate('/api/user/profile') // Let the chat know that there are new assistants!
    router.push(`/assistants/${response.data.id}`)
  }

  const onEdit = (assistant: dto.UserAssistant) => {
    router.push(`/assistants/${assistant.id}`)
  }

  async function onDuplicate(assistant: dto.UserAssistant) {
    const assistantUrl = `/api/assistants/${assistant.id}`
    const getResponse = await get<dto.AssistantWithTools>(assistantUrl)
    if (getResponse.error) {
      toast.error(getResponse.error.message)
      return
    }
    const assistantToClone = getResponse.data
    const newAssistant = {
      description: assistantToClone.description,
      name: 'Copy of' + ' ' + assistantToClone.name,
      backendId: assistantToClone.backendId,
      model: assistantToClone.model,
      systemPrompt: assistantToClone.systemPrompt,
      tokenLimit: assistantToClone.tokenLimit,
      temperature: assistantToClone.temperature,
      tools: [],
      files: [],
      iconUri: null,
      owner: null,
    } as dto.InsertableAssistant
    const url = `/api/assistants`
    const response = await post<dto.AssistantWithOwner>(url, newAssistant)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutate(url)
    mutate('/api/user/profile') // Let the chat know that there are new assistants!
    router.push(`/assistants/${response.data.id}`)
  }

  async function onDelete(assistant: dto.UserAssistant) {
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
      <div className="flex flex-1 flex-col gap-2 items-center px-4 py-6">
        <div className="max-w-[960px] w-3/4 h-full flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h1 className="mb-4">{t('my_assistants')}</h1>
          </div>
          <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
            <Button disabled={haveDrafts} onClick={() => onCreateNew()} variant="primary">
              {t('create_new')}
            </Button>
          </SearchBarWithButtonsOnRight>
          <ScrollArea className="flex-1 min-h-0">
            <div className=" gap-4 flex flex-col">
              {(assistants ?? [])
                .filter((assistant) => isMine(assistant, profile))
                .filter(filterWithSearch)
                .map((assistant) => {
                  return (
                    <div key={assistant.id} className="flex group align-center gap-2 items-center">
                      <Avatar
                        className="shrink-0 self-center"
                        size="big"
                        url={assistant.iconUri ?? undefined}
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
                            onClick: () => onEdit(assistant),
                            text: t('edit'),
                          },
                          {
                            icon: IconCopy,
                            onClick: () => onDuplicate(assistant),
                            text: t('duplicate'),
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
