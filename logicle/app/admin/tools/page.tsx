'use client'
import { useTranslation } from 'next-i18next'
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

const AllTools = () => {
  const { t } = useTranslation()
  const { isLoading, error, data: tools } = useTools()
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState<string>('')
  const modalContext = useConfirmationContext()

  async function onDelete(tool: dto.ToolDTO) {
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
    toast.success(t('tool-deleted'))
  }

  const columns: Column<dto.ToolDTO>[] = [
    column(t('table-column-name'), (tool) => (
      <Link variant="ghost" href={`/admin/tools/${tool.id}`}>
        {tool.name}
      </Link>
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

  async function onTypeSelect(toolName: string) {
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
            <DropdownMenuButton onClick={() => onTypeSelect('chatgpt-retrieval-plugin')}>
              ChatGpt Retrieval
            </DropdownMenuButton>
            <DropdownMenuButton onClick={() => onTypeSelect('timeofday')}>
              Time of day
            </DropdownMenuButton>
            <DropdownMenuButton onClick={() => onTypeSelect('openapi')}>Openapi</DropdownMenuButton>
            <DropdownMenuButton onClick={() => onTypeSelect('file-manager')}>
              Files
            </DropdownMenuButton>
            <DropdownMenuButton onClick={() => onTypeSelect('dall-e')}>
              Image generation
            </DropdownMenuButton>
          </DropdownMenuContent>
        </DropdownMenu>
      </SearchBarWithButtonsOnRight>
      <ScrollableTable
        className="flex-1"
        columns={columns}
        rows={(tools ?? []).filter(
          (u) =>
            searchTerm.trim().length == 0 || u.name.toUpperCase().includes(searchTerm.toUpperCase())
        )}
        keygen={(t) => t.id}
      />
    </AdminPage>
  )
}

export default AllTools
