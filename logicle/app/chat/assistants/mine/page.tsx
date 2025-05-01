'use client'
import { ScrollArea } from '@/components/ui/scroll-area'
import { useRouter } from 'next/navigation'
import { useSWRJson } from '@/hooks/swr'
import { WithLoadingAndError } from '@/components/ui'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Column, SimpleTable } from '@/components/ui/tables'
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
import { canDeleteAssistant, canEditAssistant } from '@/lib/rbac'
import TimeAgo from 'javascript-time-ago'
import en from 'javascript-time-ago/locale/en'
import it from 'javascript-time-ago/locale/it'
import ReactTimeAgo from 'react-time-ago'

TimeAgo.addDefaultLocale(it)
TimeAgo.addLocale(en)

const EMPTY_ASSISTANT_NAME = ''

const MyAssistantPage = () => {
  const { t, i18n } = useTranslation()
  const router = useRouter()
  const profile = useUserProfile()
  const modalContext = useConfirmationContext()
  const [searchTerm, setSearchTerm] = useState<string>('')

  const {
    data: assistants,
    isLoading,
    error,
  } = useSWRJson<dto.UserAssistant[]>(`/api/user/assistants/explore`)
  const { data: backends } = useBackendsModels()
  const searchTermLowerCase = searchTerm.toLocaleLowerCase()

  const describeSharing = (assistant: dto.UserAssistant) => {
    for (const sharing of assistant.sharing) {
      if (sharing.type == 'all') return t('everyone_in_the_company')
    }
    for (const sharing of assistant.sharing) {
      if (sharing.type == 'workspace') return t('workspace')
    }
    return t('only-me')
  }

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

  const columns: Column<dto.UserAssistant>[] = [
    {
      name: t(' '),
      renderer: (assistant: dto.UserAssistant) => (
        <AssistantAvatar className="shrink-0 self-center" size="big" assistant={assistant} />
      ),
      accessorFn: (row) => row.name,
    },
    {
      name: t('description'),
      renderer: (assistant: dto.UserAssistant) => (
        <div className="flex flex-col flex-1 h-full">
          <div className="font-bold">{assistant.name}</div>
          <div className="opacity-50 overflow-hidden text-ellipsis line-clamp-2">
            {assistant.description}
          </div>
          <div className="flex flex-row flex-wrap gap-1 pt-1">
            {assistant.tags.map((tag) => (
              <Badge key={tag} title={tag} variant="outline">
                <span className="max-w-[200px] truncate ph-2">{tag}</span>
              </Badge>
            ))}
          </div>
        </div>
      ),
      accessorFn: (assistant: dto.UserAssistant) => assistant.name,
    },
    {
      name: t('last_upd'),
      renderer: (assistant: dto.UserAssistant) => (
        <div>
          <ReactTimeAgo
            date={assistant.updatedAt ? Date.parse(assistant.updatedAt) : Date.now()}
            locale={i18n.language}
            updateInterval={10000}
            timeStyle="mini-minute"
          ></ReactTimeAgo>
        </div>
      ),
      accessorFn: (assistant: dto.UserAssistant) => assistant.updatedAt,
    },
    {
      name: t('sharing'),
      renderer: (assistant: dto.UserAssistant) => (
        <div className="">{describeSharing(assistant)}</div>
      ),
      accessorFn: (assistant: dto.UserAssistant) => describeSharing(assistant),
    },
    {
      name: t('table-column-actions'),
      renderer: (assistant: dto.UserAssistant) => (
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
            visible={canDeleteAssistant(assistant, profile)}
            onClick={async () => {
              await onDelete(assistant)
            }}
            text={t('delete')}
            destructive={true}
          />
        </ActionList>
      ),
    },
  ]

  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      <div className="flex flex-1 flex-col gap-2 items-center px-4 py-6">
        <div className="max-w-[1280px] w-5/6 h-full flex flex-col gap-3">
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
              <SimpleTable
                className="flex-1 text-sm"
                columns={columns}
                rows={(assistants ?? [])
                  .filter(
                    (assistant) =>
                      profile && canEditAssistant(assistant, profile.id, profile.workspaces || [])
                  )
                  .filter(filterWithSearch)
                  .slice()
                  .sort((a, b) => -a.updatedAt.localeCompare(b.updatedAt))}
                keygen={(t) => t.id}
              />
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
