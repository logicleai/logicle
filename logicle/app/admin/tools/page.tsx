'use client'
import { useTranslation } from 'react-i18next'
import { mutateTools, useTools } from '@/hooks/tools'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { Column, ScrollableTable, column } from '@/components/ui/tables'
import toast from 'react-hot-toast'
import { delete_ } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { Link } from '@/components/ui/link'
import { useRouter } from 'next/navigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuButton,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { useState } from 'react'
import { AdminPage } from '../components/AdminPage'
import { Action, ActionList } from '@/components/ui/actionlist'
import { IconTrash } from '@tabler/icons-react'
import { TimeOfDayInterface } from '@/lib/tools/timeofday/interface'
import { OpenApiInterface } from '@/lib/tools/openapi/interface'
import { Dall_ePluginInterface } from '@/lib/tools/dall-e/interface'
import { ToolType } from '@/lib/tools/tools'
import { WebSearchInterface } from '@/lib/tools/websearch/interface'
import { Badge } from '@/components/ui/badge'

const creatableTools: ToolType[] = [
  OpenApiInterface.toolName,
  Dall_ePluginInterface.toolName,
  TimeOfDayInterface.toolName,
  WebSearchInterface.toolName,
]

const AllTools = () => {
  const { t } = useTranslation()
  const { isLoading, error, data: tools } = useTools()
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState<string>('')
  const modalContext = useConfirmationContext()

  async function onDelete(tool: dto.Tool) {
    const result = await modalContext.askConfirmation({
      title: `${t('remove-tool')} ${tool?.name}`,
      message: t('remove-tool-confirmation'),
      confirmMsg: t('remove-tool'),
    })
    if (!result) return

    const response = await delete_(`/api/tools/${tool.id}`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutateTools()
    toast.success(t('tool-successfully-deleted'))
  }

  const columns: Column<dto.Tool>[] = [
    column(t('table-column-name'), (tool) => (
      <Link variant="ghost" href={`/admin/tools/${tool.id}`}>
        {tool.name}
      </Link>
    )),
    column(t('tags'), (tool) => (
      <div className="flex flex-row flex-wrap gap-2">
        {tool.tags.map((s) => (
          <Badge key={s} variant="secondary">
            {s}
          </Badge>
        ))}
      </div>
    )),
    column(t('table-column-actions'), (tool) => (
      <ActionList>
        <Action
          icon={IconTrash}
          onClick={async () => {
            await onDelete(tool)
          }}
          text={t('remove-tool')}
          destructive={true}
        />
      </ActionList>
    )),
  ]

  async function onTypeSelect(toolName: ToolType) {
    const queryString = new URLSearchParams({
      type: toolName,
    }).toString()
    const url = `/admin/tools/create?${queryString}`
    router.push(url)
  }

  return (
    <AdminPage isLoading={isLoading} error={error} title={t('all-tools')}>
      <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button>{t('create_tool')}</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent sideOffset={5}>
            {creatableTools.map((type) => (
              <DropdownMenuButton key={type} onClick={() => onTypeSelect(type)}>
                {t(type)}
              </DropdownMenuButton>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </SearchBarWithButtonsOnRight>
      <ScrollableTable
        className="flex-1"
        columns={columns}
        rows={(tools ?? []).filter((tool) => {
          if (searchTerm.trim().length == 0) return true
          if (tool.name.toUpperCase().includes(searchTerm.toUpperCase())) return true
          if (tool.tags.some((tag) => tag.toUpperCase().includes(searchTerm.toUpperCase())))
            return true
          return false
        })}
        keygen={(t) => t.id}
      />
    </AdminPage>
  )
}

export default AllTools
