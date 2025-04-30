'use client'
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
import { useBackendsModels } from '@/hooks/backends'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { Action, ActionList } from '@/components/ui/actionlist'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { AssistantAvatar } from '@/components/app/Avatars'
import { WorkspaceRole } from '@/types/workspace'

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
  const { t } = useTranslation()
  const router = useRouter()
  const profile = useUserProfile()
  const modalContext = useConfirmationContext()
  const [searchTerm, setSearchTerm] = useState<string>('')

  /**
   * @param assistant
   * @param profile the user profile
   * @returns whether the user can edit the assistant
   */
  const canEditAssistant = (assistant: dto.UserAssistant, profile: dto.UserProfile | undefined) => {
    // A user can edit the assistant if:
    // - he is the owner
    // - he has the WorkspaceRole Editor role in the same workspace where the assistant has been shared
    //   (if the assistant has been shared to all it is editable only by the owner)
    if (assistant.owner == profile?.id) return true

    return assistant.sharing.some((s) => {
      if (dto.isAllSharingType(s)) return false

      return profile?.workspaces.some((w) => {
        return (
          w.id == s.workspaceId &&
          (w.role == WorkspaceRole.EDITOR ||
            w.role == WorkspaceRole.OWNER ||
            w.role == WorkspaceRole.ADMIN)
        )
      })
    })
  }

  const {
    data: assistants,
    isLoading,
    error,
  } = useSWRJson<dto.UserAssistant[]>(`/api/user/assistants/explore`)
  const { data: backends } = useBackendsModels()
  const searchTermLowerCase = searchTerm.toLocaleLowerCase()
  const filterWithSearch = (assistant: dto.UserAssistant) => {
    return (
      searchTerm.trim().length == 0 ||
      assistant.name.toLocaleLowerCase().includes(searchTermLowerCase) ||
      assistant.description.toLocaleLowerCase().includes(searchTermLowerCase) ||
      !!assistant.tags.find((s) => s.toLocaleLowerCase().includes(searchTermLowerCase))
    )
  }
  const haveDefaultBackend = backends && backends.length && backends[0].models.length
  const onCreateNew = async () => {
    if (!haveDefaultBackend) return
    const newAssistant = {
      description: '',
      name: EMPTY_ASSISTANT_NAME,
      backendId: backends[0].backendId,
      model: backends[0].models[0].id,
      systemPrompt: '',
      tokenLimit: 16000,
      temperature: DEFAULT_TEMPERATURE,
      tools: [],
      files: [],
      iconUri: null,
      owner: null,
      tags: [],
      prompts: [],
      reasoning_effort: null,
    } as dto.InsertableAssistant
    const url = `/api/assistants`
    const response = await post<dto.AssistantWithOwner>(url, newAssistant)

    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutate(url)
    await mutate('/api/user/profile') // Let the chat know that there are new assistants!
    router.push(`/assistants/${response.data.id}`)
  }

  const onEdit = (assistant: dto.UserAssistant) => {
    router.push(`/assistants/${assistant.id}`)
  }

  async function onDuplicate(assistant: dto.UserAssistant) {
    const assistantUrl = `/api/assistants/${assistant.id}/clone`
    const response = await post<dto.AssistantWithOwner>(assistantUrl)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutate(`/api/assistants`)
    await mutate('/api/user/profile') // Let the chat know that there are new assistants!
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
    await mutate('/api/assistants')
    await mutate('/api/user/profile')
    await mutate('/api/user/assistants/explore')
    toast.success(t('assistant-deleted'))
  }

  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      <div className="flex flex-1 flex-col gap-2 items-center px-4 py-6">
        <div className="max-w-[960px] w-3/4 h-full flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h1 className="mb-4">{t('my-assistants')}</h1>
          </div>
          <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
            <Button disabled={!haveDefaultBackend} onClick={() => onCreateNew()} variant="primary">
              {t('create_new')}
            </Button>
          </SearchBarWithButtonsOnRight>
          <ScrollArea className="flex-1 min-h-0">
            <div className=" gap-4 flex flex-col">
              {(assistants ?? [])
                .filter((assistant) => canEditAssistant(assistant, profile))
                .filter(filterWithSearch)
                .slice()
                .sort((a, b) => -a.updatedAt.localeCompare(b.updatedAt))
                .map((assistant) => {
                  return (
                    <div key={assistant.id} className="flex group align-center gap-2 items-center">
                      <AssistantAvatar
                        className="shrink-0 self-center"
                        size="big"
                        assistant={assistant}
                      />
                      <div className="flex flex-col flex-1 h-full">
                        <div className="font-bold">{assistant.name}</div>
                        <div className="opacity-50 overflow-hidden text-ellipsis line-clamp-2">
                          {assistant.description}
                        </div>
                        <div className="flex flex-row flex-wrap gap-1 pt-1">
                          {assistant.tags.map((tag) => (
                            <Badge key={tag} variant="outline">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div className="">{describeSharing(assistant)}</div>
                      <ActionList>
                        <Action
                          icon={IconEdit}
                          onClick={async () => {
                            onEdit(assistant)
                          }}
                          text={t('edit')}
                        />
                        <Action
                          icon={IconCopy}
                          onClick={async () => {
                            await onDuplicate(assistant)
                          }}
                          text={t('duplicate')}
                        />
                        <Action
                          icon={IconTrash}
                          onClick={async () => {
                            await onDelete(assistant)
                          }}
                          text={t('delete')}
                          destructive={true}
                        />
                      </ActionList>
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
  return <MyAssistantPage></MyAssistantPage>
}

export default MyAssistantPageWithToolbars
