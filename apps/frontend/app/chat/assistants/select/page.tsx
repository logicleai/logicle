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
import { useLayoutConfig } from '@/components/providers/layoutconfigContext'

const EMPTY_ASSISTANT_NAME = ''

const orderingValues = ['name', 'lastused'] as const
type Ordering = (typeof orderingValues)[number]

const SelectAssistantPage = () => {
  const { setNewChatAssistantId } = useContext(ChatPageContext)
  const { t } = useTranslation()
  const router = useRouter()
  const profile = useUserProfile()
  const { isMobile } = useLayoutConfig()
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [tagsFilter, setTagsFilter] = useState<string | null>(null)
  const [ordering, setOrdering] = useUiState<Ordering>('assistants_select_ordering', 'lastused')

  const {
    data: assistants,
    isLoading,
    error,
  } = useSWRJson<dto.UserAssistant[]>(`/api/me/assistants/explore`)

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
  const tagEntries = new Map<string, string>()
  for (const assistant of availableAssistants) {
    for (const tag of assistant.tags) {
      const key = tag.toLocaleLowerCase()
      if (!tagEntries.has(key)) tagEntries.set(key, tag)
    }
  }
  const tags = [
    null,
    ...Array.from(tagEntries.entries())
      .sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }))
      .map(([key, label]) => ({ key, label })),
  ]

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
    return tagsFilter == null || assistant.tags.some((t) => t.toLocaleLowerCase() === tagsFilter)
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
      <div className="flex h-full w-full flex-1 justify-center overflow-hidden">
        <div className="flex w-full max-w-[1440px] flex-1 flex-col gap-5 overflow-hidden px-5 py-6 sm:px-8 sm:py-8">
          <div className="flex items-center gap-4">
            <div className="min-w-0">
              <h1 className="text-2xl">{t('select-assistant')}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {availableAssistants.length} {t('assistants').toLowerCase()}
              </p>
            </div>
            <span className="flex-1" />
            <Button
              variant="secondary"
              className={isMobile ? 'self-end' : ''}
              onClick={gotoMyAssistants}
            >
              {t('my-assistants')}
            </Button>
          </div>
          <div className="flex min-h-0 flex-1 flex-col gap-4">
            <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
              {' '}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="secondary"
                    className="min-w-10 gap-0.5 px-2 [&_svg]:shrink-0"
                    title={ordering === 'name' ? t('order-by-name') : t('order-by-last-usage')}
                    aria-label={ordering === 'name' ? t('order-by-name') : t('order-by-last-usage')}
                  >
                    {ordering === 'name' ? (
                      <IconSortAZ size={22} />
                    ) : (
                      <>
                        <IconCalendar size={20} />
                        <IconArrowNarrowDown size={16} />
                      </>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="" sideOffset={5}>
                  <DropdownMenuButton icon={IconSortAZ} onClick={() => setOrdering('name')}>
                    {t('order-by-name')}
                  </DropdownMenuButton>
                  <DropdownMenuButton icon={IconClock} onClick={() => setOrdering('lastused')}>
                    {t('order-by-last-usage')}
                  </DropdownMenuButton>
                </DropdownMenuContent>
              </DropdownMenu>
            </SearchBarWithButtonsOnRight>
            <RovingFocus.Root orientation="horizontal" loop>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {tags.map((tag) => (
                  <RovingFocus.Item asChild key={tag?.key ?? ''}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={tagsFilter === tag?.key}
                      className={`shrink-0 rounded-full border px-3 py-1 text-xs transition-colors ${
                        tagsFilter === tag?.key
                          ? 'border-foreground bg-foreground text-background'
                          : 'border-border bg-background text-muted-foreground hover:border-border-strong hover:text-foreground'
                      }`}
                      onClick={() => setTagsFilter(tag?.key ?? null)}
                    >
                      {tag?.label ?? t('no-filter')}
                    </button>
                  </RovingFocus.Item>
                ))}
              </div>
            </RovingFocus.Root>
            <ScrollArea className="flex-1">
              <div className="grid grid-cols-1 gap-3 pb-4 sm:grid-cols-2 xl:grid-cols-3">
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
                        className="group flex h-auto w-full gap-3 overflow-hidden rounded-xl border border-border bg-background p-4 text-left shadow-sm transition-shadow hover:border-border-strong hover:shadow-md"
                        onClick={() => handleSelect(assistant)}
                      >
                        <AssistantAvatar
                          className="h-10 w-10 shrink-0 self-start"
                          size="default"
                          assistant={assistant}
                        />
                        <span className="flex h-full min-w-0 flex-1 flex-col gap-1 overflow-hidden">
                          <span className="truncate text-[15px] font-semibold">
                            {assistant.name}
                          </span>
                          <span className="line-clamp-2 overflow-hidden text-ellipsis text-[13px] leading-5 text-muted-foreground">
                            {assistant.description}
                          </span>
                          <span className="flex flex-row flex-wrap gap-1 pt-1">
                            {assistant.tags.map((tag) => (
                              <Badge
                                key={tag ?? ''}
                                variant="secondary"
                                className="text-[11px] font-medium"
                              >
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
    </WithLoadingAndError>
  )
}

const SelectAssistantPageWithToolbars = () => {
  return <SelectAssistantPage></SelectAssistantPage>
}

export default SelectAssistantPageWithToolbars
