'use client'
import { ScrollArea } from '@/components/ui/scroll-area'
import ChatPageContext from '@/app/chat/components/context'
import { useRouter } from 'next/navigation'
import { useContext, useState } from 'react'
import { useSWRJson } from '@/hooks/swr'
import { WithLoadingAndError } from '@/components/ui'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import * as dto from '@/types/dto'
import { Badge } from '@/components/ui/badge'
import { AssistantAvatar } from '@/components/app/Avatars'
import { isSharedWithAllOrAnyWorkspace } from '@/types/dto'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuButton,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { IconArrowNarrowDown, IconCalendar, IconClock, IconSortAZ } from '@tabler/icons-react'
import { useUiState } from '@/components/providers/uistate'
import * as RovingFocus from '@radix-ui/react-roving-focus'

const EMPTY_ASSISTANT_NAME = ''

const orderingValues = ['name', 'lastused'] as const
type Ordering = (typeof orderingValues)[number]

const SelectAssistantPage = () => {
  const { setNewChatAssistantId } = useContext(ChatPageContext)
  const { t } = useTranslation()
  const router = useRouter()
  const profile = useUserProfile()
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [tagsFilter, setTagsFilter] = useState<string | null>(null)
  const [ordering, setOrdering] = useUiState<Ordering>('assistants_select_ordering', 'lastused')

  const {
    data: assistants,
    isLoading,
    error,
  } = useSWRJson<dto.UserAssistant[]>(`/api/user/assistants/explore`)

  const isAssistantAvailable = (assistant: dto.UserAssistant) => {
    if (assistant.name === EMPTY_ASSISTANT_NAME) return false
    if (assistant.owner === profile?.id) return true
    const workspaceIds = profile?.workspaces?.map((w) => w.id) || []
    return isSharedWithAllOrAnyWorkspace(assistant.sharing, workspaceIds)
  }

  const availableAssistants = (assistants ?? [])
    .filter(isAssistantAvailable)
    .sort(
      ordering === 'lastused'
        ? (a, b) => (b.lastUsed ?? '1970-01-01').localeCompare(a.lastUsed ?? '1970-01-01')
        : (a, b) => a.name.localeCompare(b.name)
    )
  const tags = [null, ...[...new Set(availableAssistants.flatMap((a) => a.tags))].slice().sort()]

  const searchTermLowerCase = searchTerm.toLocaleLowerCase()
  const filterWithSearch = (assistant: dto.UserAssistant) => {
    return (
      searchTerm.trim().length === 0 ||
      assistant.name.toLocaleLowerCase().includes(searchTermLowerCase) ||
      assistant.description.toLocaleLowerCase().includes(searchTermLowerCase) ||
      !!assistant.tags.find((s) => s.toLocaleLowerCase().includes(searchTermLowerCase))
    )
  }

  const filterWithTags = (assistant: dto.UserAssistant) => {
    return tagsFilter == null || assistant.tags.some((t) => tagsFilter === t)
  }

  // just simulate a lot of assistants
  //for(let a = 0; a < 5; a++) { assistants = [...assistants, ...assistants] }
  const handleSelect = (assistant: dto.UserAssistant) => {
    if (!(assistant.name === EMPTY_ASSISTANT_NAME && assistant.owner === profile?.id)) {
      setNewChatAssistantId(assistant.id)
      router.push('/chat')
    }
  }

  const gotoMyAssistants = () => {
    router.push('/chat/assistants/mine')
  }

  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      <div className="flex flex-1 h-full w-full justify-center">
        <div className="flex flex-1 flex-col gap-2 max-w-[1440px] w-5/6 px-4 py-6">
          <div className="relative">
            <h1 className="text-center">{t('select_assistant')}</h1>
            <Button
              className="absolute right-0 top-1/2 -translate-y-1/2"
              onClick={gotoMyAssistants}
            >
              {t('my-assistants')}
            </Button>
          </div>
          <div className="flex-1 flex min-h-0 flex-row gap-2">
            <div className="h-full w-[220px] flex flex-col">
              <h2 className="p-2">{t('tags')}</h2>
              <ScrollArea className="scroll-workaround h-full p-2">
                <RovingFocus.Root orientation="vertical" loop>
                  <ul role="listbox">
                    {tags.map((tag) => (
                      <li
                        key={tag ?? ''}
                        className={`flex items-center py-1 gap-2 rounded hover:bg-gray-100 truncate ${
                          tagsFilter === tag ? 'bg-secondary-hover' : ''
                        }`}
                      >
                        <RovingFocus.Item asChild>
                          <button
                            type="button"
                            role="option"
                            aria-selected={tagsFilter === tag}
                            className="w-full text-left overflow-hidden px-2 py-1 text-small"
                            onClick={() => setTagsFilter(tag)}
                          >
                            <span className="flex-1 first-letter:capitalize truncate">
                              {tag ?? t('no_filter')}
                            </span>
                          </button>
                        </RovingFocus.Item>
                      </li>
                    ))}
                  </ul>
                </RovingFocus.Root>
              </ScrollArea>
            </div>
            <div className="h-full flex-1 flex flex-col gap-3">
              <SearchBarWithButtonsOnRight
                searchTerm={searchTerm}
                onSearchTermChange={setSearchTerm}
              >
                {' '}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="w-[4em]">
                      {ordering === 'name' ? (
                        <IconSortAZ />
                      ) : (
                        <>
                          <IconCalendar />
                          <IconArrowNarrowDown />
                        </>
                      )}
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="" sideOffset={5}>
                    <DropdownMenuButton icon={IconSortAZ} onClick={() => setOrdering('name')}>
                      {t('order_by_name')}
                    </DropdownMenuButton>
                    <DropdownMenuButton icon={IconClock} onClick={() => setOrdering('lastused')}>
                      {t('order_by_last_usage')}
                    </DropdownMenuButton>
                  </DropdownMenuContent>
                </DropdownMenu>
              </SearchBarWithButtonsOnRight>
              <ScrollArea className="flex-1">
                {
                  //     grid-template-columns: repeat(auto-fill, minmax(max(var(--max-item-width), calc((100% - var(--gap) * (var(--rows) - 1)) / var(--rows))), 1fr));
                }
                <div className="grid grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(max(300px,calc((100%-1rem*2)/3)),1fr))] m-auto">
                  {availableAssistants
                    .filter(filterWithSearch)
                    .filter(filterWithTags)
                    .sort(
                      ordering === 'lastused'
                        ? (a, b) =>
                            (b.lastUsed ?? '1970-01-01').localeCompare(a.lastUsed ?? '1970-01-01')
                        : (a, b) => a.name.localeCompare(b.name)
                    )
                    .map((assistant) => {
                      return (
                        <button
                          type="button"
                          key={assistant.id}
                          className="flex gap-3 py-2 px-4 border text-left w-full overflow-hidden h-18 group"
                          onClick={() => handleSelect(assistant)}
                        >
                          <AssistantAvatar
                            className="shrink-0 self-center"
                            size="big"
                            assistant={assistant}
                          />
                          <span className="flex flex-col flex-1 h-full overflow-hidden">
                            <span className="font-bold truncate">{assistant.name}</span>
                            <span className="opacity-50 overflow-hidden text-ellipsis line-clamp-2 leading-[1.2rem] h-[2.4rem]">
                              {assistant.description}
                            </span>
                            <span className="flex flex-row flex-wrap gap-1 pt-1">
                              {assistant.tags.map((tag) => (
                                <Badge key={tag ?? ''} variant="outline">
                                  {tag}
                                </Badge>
                              ))}
                            </span>
                          </span>
                        </button>
                      )
                    })}
                </div>
              </ScrollArea>
            </div>
          </div>
        </div>
      </div>
    </WithLoadingAndError>
  )
}

const SelectAssistantPageWithToolbars = () => {
  return <SelectAssistantPage></SelectAssistantPage>
}

export default SelectAssistantPageWithToolbars
