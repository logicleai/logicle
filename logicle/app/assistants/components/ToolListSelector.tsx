import { useTranslation } from 'react-i18next'
import { useTools } from '@/hooks/tools'
import { useState } from 'react'
import { Column, ScrollableTable, column } from '@/components/ui/tables'
import * as dto from '@/types/dto'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'

interface Props {
  tools: dto.AssistantTool[]
  onSelectionChange: (tools: dto.AssistantTool[]) => void
}

export const ToolListSelector = ({ tools, onSelectionChange }: Props) => {
  const { t } = useTranslation()
  const [selection, setSelection] = useState<Map<string, dto.AssistantTool>>(new Map())
  const [searchTerm, setSearchTerm] = useState<string>('')

  const toggleTool = (Tool: dto.AssistantTool) => {
    const newMap = new Map(selection)
    if (!newMap.delete(Tool.id)) {
      newMap.set(Tool.id, Tool)
    }
    setSelection(newMap)
    onSelectionChange(Array.from(newMap.values()))
  }
  const searchTermLowerCase = searchTerm.toLocaleLowerCase()
  const ToolsFiltered =
    searchTerm.length == 0
      ? tools
      : tools.filter((t) => {
          return t.name.toLocaleLowerCase().includes(searchTermLowerCase)
        })
  const columns: Column<dto.AssistantTool>[] = [
    column(t('table-column-name'), (Tool: dto.AssistantTool) => <>{Tool.name}</>),
    column(t('table-column-selected'), (Tool: dto.AssistantTool) => (
      <div className="text-center">{selection.has(Tool.id) ? '✔' : ''}</div>
    )),
  ]

  return (
    <div>
      <SearchBarWithButtonsOnRight
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
      ></SearchBarWithButtonsOnRight>
      <ScrollableTable
        className="flex-1 text-body1 h-[24rem] table-auto"
        columns={columns}
        onRowClick={toggleTool}
        rows={ToolsFiltered}
        keygen={(t) => t.id}
      />
    </div>
  )
}
