'use client'
import { useTranslation } from 'next-i18next'
import { mutateTools, useTools } from '@/hooks/tools'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { Column, ScrollableTable, column } from '@/components/ui/tables'
import toast from 'react-hot-toast'
import { WithLoadingAndError } from '@/components/ui'
import { delete_ } from '@/lib/fetch'
import { AdminPageTitle } from '@/app/admin/components/AdminPageTitle'
import { ToolDTO } from '@/types/dto'
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
import { IconPlus } from '@tabler/icons-react'

const AllTools = () => {
  const { t } = useTranslation('common')
  const { isLoading, error, data: tools } = useTools()
  const router = useRouter()

  const modalContext = useConfirmationContext()
  async function onDelete(tool: ToolDTO) {
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

  const columns: Column<ToolDTO>[] = [
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
    <WithLoadingAndError isLoading={isLoading} error={error}>
      <div className="h-full flex flex-col">
        <AdminPageTitle title={t('all-tools')}>
          {' '}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="px-2">
                <IconPlus size={18} />
              </Button>
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
        </AdminPageTitle>
        <ScrollableTable
          className="flex-1"
          columns={columns}
          rows={tools ?? []}
          keygen={(t) => t.id}
        />
      </div>
    </WithLoadingAndError>
  )
}

export default AllTools
