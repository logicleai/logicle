import { useTranslation } from 'react-i18next'
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

  const toggleTool = (tool: dto.AssistantTool) => {
    if (!tool.visible) return
    const newMap = new Map(selection)
    if (!newMap.delete(tool.id)) {
      newMap.set(tool.id, tool)
    }
    setSelection(newMap)
    onSelectionChange(Array.from(newMap.values()))
  }
  const searchTermLowerCase = searchTerm.toLocaleLowerCase()
  const toolsFiltered =
    searchTerm.length == 0
      ? tools
      : tools.filter((t) => {
          return t.name.toLocaleLowerCase().includes(searchTermLowerCase)
        })
  const columns: Column<dto.AssistantTool>[] = [
    column(t('table-column-name'), (tool: dto.AssistantTool) => (
      <span className={`${tool.visible ? '' : 'opacity-50 italic'}`}>{tool.name}</span>
    )),
    {
      name: t('table-column-selected'),
      renderer: (tool: dto.AssistantTool) => (
        <div className="text-center">{selection.has(tool.id) ? '✔' : ''}</div>
      ),
      headerClass: 'text-center',
    },
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
        rows={toolsFiltered}
        keygen={(t) => t.id}
      />
    </div>
  )
}
