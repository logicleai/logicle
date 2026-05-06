import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import useSWRInfinite from 'swr/infinite'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import * as dto from '@/types/dto'
import { ScrollableTable, column } from '@/components/ui/tables'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'

interface Props {
  onClose: () => void
  onAddAssistants: (assistants: dto.UserAssistant[]) => void
  excludeIds: string[]
}

const PAGE_SIZE = 50

const fetchJson = async (url: string) => {
  const response = await fetch(url)
  const json = await response.json()
  if (!response.ok) {
    throw new Error(json.error?.message || 'An error occurred while fetching the data')
  }
  return json
}

export const AddAssistantDialog = ({ onClose, onAddAssistants, excludeIds }: Props) => {
  const { t } = useTranslation()
  const [selection, setSelection] = useState<Map<string, dto.UserAssistant>>(new Map())
  const [searchTerm, setSearchTerm] = useState<string>('')
  const getSearchKey = (
    pageIndex: number,
    previousPage: dto.AssistantSearchResponse | null
  ) => {
    if (previousPage && previousPage.nextOffset === null) return null
    const offset = previousPage?.nextOffset ?? pageIndex * PAGE_SIZE
    const params = new URLSearchParams({
      limit: String(PAGE_SIZE),
      offset: String(offset),
      orderBy: 'name',
    })
    if (searchTerm.trim().length > 0) params.set('search', searchTerm.trim())
    if (excludeIds.length > 0) params.set('excludeIds', excludeIds.join(','))
    return `/api/me/assistants/search?${params.toString()}`
  }
  const { data, size, setSize, isValidating } = useSWRInfinite<dto.AssistantSearchResponse>(
    getSearchKey,
    fetchJson
  )

  const toggleAssistant = (assistant: dto.UserAssistant) => {
    const newMap = new Map(selection)
    if (!newMap.delete(assistant.id)) {
      newMap.set(assistant.id, assistant)
    }
    setSelection(newMap)
  }

  const rows = (data ?? []).flatMap((page) => page.items)
  const lastPage = data?.[data.length - 1]
  const hasMore = lastPage !== undefined && lastPage.nextOffset !== null

  const columns = [
    column(t('table-column-name'), (a: dto.UserAssistant) => <span>{a.name}</span>),
    column(t('description'), (a: dto.UserAssistant) => (
      <span className="text-muted-foreground truncate block max-w-xs">{a.description}</span>
    )),
    {
      name: t('table-column-selected'),
      renderer: (a: dto.UserAssistant) => (
        <div className="text-center">{selection.has(a.id) ? '✔' : ''}</div>
      ),
      headerClass: 'text-center',
    },
  ]

  async function onSubmit() {
    onAddAssistants(Array.from(selection.values()))
    onClose()
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="flex flex-col max-w-[64rem]">
        <DialogHeader>
          <DialogTitle>{t('select-assistants-to-add')}</DialogTitle>
        </DialogHeader>
        <div className="overflow-hidden">
          <SearchBarWithButtonsOnRight
            searchTerm={searchTerm}
            onSearchTermChange={setSearchTerm}
          />
          <ScrollableTable
            className="flex-1 text-body1 h-[24rem] table-auto"
            columns={columns}
            onRowClick={toggleAssistant}
            rows={rows}
            keygen={(a) => a.id}
          />
          {hasMore && (
            <div className="flex justify-center pt-3">
              <Button disabled={isValidating} onClick={() => setSize(size + 1)}>
                {t('load_more')}
              </Button>
            </div>
          )}
        </div>
        <div className="flex justify-center">
          <Button onClick={() => onSubmit()}>{t('add')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
