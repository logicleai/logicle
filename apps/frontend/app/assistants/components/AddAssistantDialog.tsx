import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import * as dto from '@/types/dto'
import { ScrollableTable, column } from '@/components/ui/tables'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'

interface Props {
  onClose: () => void
  onAddAssistants: (assistants: dto.UserAssistant[]) => void
  candidates: dto.UserAssistant[]
}

export const AddAssistantDialog = ({ onClose, onAddAssistants, candidates }: Props) => {
  const { t } = useTranslation()
  const [selection, setSelection] = useState<Map<string, dto.UserAssistant>>(new Map())
  const [searchTerm, setSearchTerm] = useState<string>('')

  const toggleAssistant = (assistant: dto.UserAssistant) => {
    const newMap = new Map(selection)
    if (!newMap.delete(assistant.id)) {
      newMap.set(assistant.id, assistant)
    }
    setSelection(newMap)
  }

  const searchTermLowerCase = searchTerm.toLocaleLowerCase()
  const filtered =
    searchTerm.length === 0
      ? candidates
      : candidates.filter((a) => a.name.toLocaleLowerCase().includes(searchTermLowerCase))

  const columns = [
    column(t('table-column-name'), (a: dto.UserAssistant) => <span>{a.name}</span>),
    column(t('description'), (a: dto.UserAssistant) => (
      <span className="text-muted-foreground">{a.description}</span>
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
        <SearchBarWithButtonsOnRight
          searchTerm={searchTerm}
          onSearchTermChange={setSearchTerm}
        />
        <ScrollableTable
          className="flex-1 text-body1 h-[24rem] table-auto"
          columns={columns}
          onRowClick={toggleAssistant}
          rows={filtered}
          keygen={(a) => a.id}
        />
        <div className="flex justify-center">
          <Button onClick={() => onSubmit()}>{t('add')}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
