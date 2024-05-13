'use client'
import { Avatar } from '@/components/ui/avatar'
import { ScrollArea } from '@/components/ui/scroll-area'
import ChatPageContext from '@/app/chat/components/context'
import { UserAssistant } from '@/types/chat'
import { useRouter } from 'next/navigation'
import { useContext, useState } from 'react'
import { useSWRJson } from '@/hooks/swr'
import { WithLoadingAndError } from '@/components/ui'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { UserProfileDto } from '@/types/user'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { IconPlus, IconSettings, IconTrash } from '@tabler/icons-react'
import { DEFAULT_TEMPERATURE } from '@/lib/const'
import { delete_, post } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { useBackends } from '@/hooks/backends'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { MainLayout } from '@/app/layouts/MainLayout'
import { Chatbar } from '../components/chatbar/Chatbar'

const EMPTY_ASSISTANT_NAME = ''

type FilteringMode = 'available' | 'mine' | 'workspace' | 'drafts'

const isWorkspaceVisible = (profile: UserProfileDto, workspaceId: string) => {
  return profile.workspaces?.find((w) => w.id == workspaceId)
}

const Filters: Record<
  FilteringMode,
  (assistant: UserAssistant, profile?: UserProfileDto) => boolean
> = {
  available: (assistant, profile) => {
    if (assistant.name == EMPTY_ASSISTANT_NAME) return false
    if (assistant.owner == profile?.id) return true
    for (const sharing of assistant.sharing) {
      if (sharing.type == 'all') return true
      if (
        sharing.type == 'workspace' &&
        profile &&
        isWorkspaceVisible(profile, sharing.workspaceId)
      )
        return true
    }
    return false
  },
  workspace: (assistant, profile) => {
    // I can't decide if owned assistants shared should show up in workspace tab
    if (assistant.name == EMPTY_ASSISTANT_NAME) return false
    if (assistant.owner == profile?.id) return false
    for (const sharing of assistant.sharing) {
      if (
        sharing.type == 'workspace' &&
        profile &&
        isWorkspaceVisible(profile, sharing.workspaceId)
      )
        return true
    }
    return false
  },
  mine: (assistant, profile) =>
    assistant.owner == profile?.id && assistant.name != EMPTY_ASSISTANT_NAME,
  drafts: (assistant, profile) =>
    assistant.owner == profile?.id && assistant.name == EMPTY_ASSISTANT_NAME,
}

const describeSharing = (assistant: UserAssistant) => {
  for (const sharing of assistant.sharing) {
    if (sharing.type == 'all') return 'Company'
  }
  for (const sharing of assistant.sharing) {
    if (sharing.type == 'workspace') return 'Workspace'
  }
  return 'Private'
}

const SelectAssistantPage = () => {
  const { dispatch } = useContext(ChatPageContext)
  const { t } = useTranslation('common')
  const router = useRouter()
  const profile = useUserProfile()
  const [filteringMode, setFilteringMode] = useState<FilteringMode>('available')
  const modalContext = useConfirmationContext()

  const filter = Filters[filteringMode]
  const {
    data: assistants,
    isLoading,
    error,
  } = useSWRJson<UserAssistant[]>(`/api/user/assistants/explore`)
  const { data: backends } = useBackends()
  const defaultBackend = backends && backends.length > 0 ? backends[0].id : undefined

  // just simulate a lot of assistants
  //for(let a = 0; a < 5; a++) { assistants = [...assistants, ...assistants] }
  const handleSelect = (assistant: UserAssistant) => {
    if (!(assistant.name == EMPTY_ASSISTANT_NAME && assistant.owner == profile?.id)) {
      dispatch({ field: 'newChatAssistantId', value: assistant.id })
      router.push('/chat')
    }
  }

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
      <div className="flex flex-1 flex-col gap-4">
        <h1 className="p-8 text-center">{t('select_assistant')}</h1>
        <Tabs value={filteringMode} className="self-center">
          <TabsList>
            <TabsTrigger onClick={() => setFilteringMode('available')} value="available">
              Available
            </TabsTrigger>
            {false && (
              <TabsTrigger onClick={() => setFilteringMode('workspace')} value="workspace">
                Workspace
              </TabsTrigger>
            )}
            <TabsTrigger onClick={() => setFilteringMode('mine')} value="mine">
              Only mine
            </TabsTrigger>
            {haveDrafts && (
              <TabsTrigger onClick={() => setFilteringMode('drafts')} value="drafts">
                Drafts
              </TabsTrigger>
            )}
            <div className="flex flex-row justify-center">
              <Button
                disabled={haveDrafts}
                onClick={() => onCreateAssistant()}
                variant="ghost"
                className="m-auto"
              >
                <IconPlus></IconPlus>
              </Button>
            </div>
          </TabsList>
        </Tabs>
        <ScrollArea className="flex-1">
          <div className="max-w-[960px] w-3/4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 m-auto gap-3">
            {(assistants ?? [])
              .filter((assistant) => filter(assistant, profile))
              .map((assistant) => {
                return (
                  <button
                    key={assistant.id}
                    className="flex gap-3 py-2 px-4 border text-left w-full overflow-hidden h-18 group"
                    onClick={() => handleSelect(assistant)}
                  >
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
                      <div>{describeSharing(assistant)}</div>
                    </div>
                    {(filteringMode == 'mine' || filteringMode == 'drafts') && (
                      <div className="flex flex-col self-stretch invisible group-hover:visible focus:visible opacity-80">
                        <button className="border-none bg-transparent p-1">
                          <IconSettings
                            onClick={(evt) => {
                              router.push(`/assistants/${assistant.id}`)
                              evt.stopPropagation()
                            }}
                            size={16}
                          ></IconSettings>
                        </button>
                        <button className="border-none bg-transparent p-1">
                          <IconTrash
                            className="text-destructive"
                            size={16}
                            onClick={(evt) => {
                              onDelete(assistant)
                              evt.stopPropagation()
                            }}
                          ></IconTrash>
                        </button>
                      </div>
                    )}
                  </button>
                )
              })}
          </div>
        </ScrollArea>
      </div>
    </WithLoadingAndError>
  )
}

const SelectAssistantPageWithToolbars = () => {
  return (
    <MainLayout leftBar={<Chatbar />}>
      <SelectAssistantPage></SelectAssistantPage>
    </MainLayout>
  )
}
export default SelectAssistantPageWithToolbars
