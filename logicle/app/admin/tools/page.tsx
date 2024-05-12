'use client'
import { useTranslation } from 'next-i18next'
import { mutateTools, useTools } from '@/hooks/tools'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { Column, ScrollableTable, column } from '@/components/ui/tables'
import toast from 'react-hot-toast'
import { delete_ } from '@/lib/fetch'
import * as dto from '@/types/dto'
import DeleteButton from '../components/DeleteButton'
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

const AllTools = () => {
  const { t } = useTranslation('common')
  const { isLoading, error, data: tools } = useTools()
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState<string>('')
  const modalContext = useConfirmationContext()

  async function onDelete(tool: dto.ToolDTO) {
    const result = await modalContext.askConfirmation({
      title: `${t('remove-tool')} ${tool?.name}`,
      message: <p>{t('remove-tool-confirmation')}</p>,
      confirmMsg: t('remove-tool'),
    })
    if (!result) return

    const response = await delete_(`/api/tools/${tool.id}`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutateTools()
    toast.success(t('tool-deleted'))
  }

  const columns: Column<dto.ToolDTO>[] = [
    column(t('table-column-name'), (tool) => (
      <Link variant="ghost" href={`/admin/tools/${tool.id}`}>
        {tool.name}
      </Link>
    )),
    column(t('table-column-actions'), (tool) => (
      <DeleteButton
        onClick={() => {
          onDelete(tool)
        }}
      >
        {t('remove-tool')}
      </DeleteButton>
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
