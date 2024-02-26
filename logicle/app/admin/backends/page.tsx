'use client'
import { useTranslation } from 'next-i18next'
import { mutateBackends, useBackends } from '@/hooks/backends'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { Column, ScrollableTable, column } from '@/components/ui/tables'
import toast from 'react-hot-toast'
import { WithLoadingAndError } from '@/components/ui'
import { delete_ } from '@/lib/fetch'
import { AdminPageTitle } from '@/app/admin/components/AdminPageTitle'
import { masked } from '@/types/secure'
import { Backend } from '@/types/dto'
import DeleteButton from '../components/DeleteButton'
import { Link } from '@/components/ui/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuButton,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { IconPlus } from '@tabler/icons-react'
import { useRouter } from 'next/navigation'
import { ProviderType } from '@/types/provider'

const AllBackends = () => {
  const { t } = useTranslation('common')
  const { isLoading, error, data: backends } = useBackends()
  const router = useRouter()

  const modalContext = useConfirmationContext()
  async function onDelete(backend: Backend) {
    const result = await modalContext.askConfirmation({
      title: `${t('remove-backend')} ${backend?.name}`,
      message: <p>{t('remove-backend-confirmation')}</p>,
      confirmMsg: t('remove-backend'),
    })
    if (!result) return

    const response = await delete_(`/api/backends/${backend.id}`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutateBackends()
    toast.success(t('backend-deleted'))
  }

  const columns: Column<Backend>[] = [
    column(t('table-column-name'), (backend) => (
      <Link variant="ghost" href={`/admin/backends/${backend.id}`}>
        {backend.name}
      </Link>
    )),
    column(t('table-column-apikey'), (backend) => masked(backend.apiKey)),
    column(t('table-column-apiendpoint'), (backend) => backend.endPoint),
    column(t('table-column-actions'), (backend) => (
      <DeleteButton
        onClick={() => {
          onDelete(backend)
        }}
      >
        {t('remove-backend')}
      </DeleteButton>
    )),
  ]

  async function onProviderSelect(providerType: ProviderType) {
    const queryString = new URLSearchParams({
      providerType: providerType.toString(),
    }).toString()
    const url = `/admin/backends/create?${queryString}`
    router.push(url)
  }

  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      <div className="h-full flex flex-col">
        <AdminPageTitle title={t('all-backends')}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="px-2">
                <IconPlus size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="" sideOffset={5}>
              <DropdownMenuButton onClick={() => onProviderSelect(ProviderType.OpenAI)}>
                OpenAI API
              </DropdownMenuButton>
              <DropdownMenuButton onClick={() => onProviderSelect(ProviderType.LocalAI)}>
                Local AI Server
              </DropdownMenuButton>
              <DropdownMenuButton onClick={() => onProviderSelect(ProviderType.Ollama)}>
                Ollama Server
              </DropdownMenuButton>
              <DropdownMenuButton onClick={() => onProviderSelect(ProviderType.GenericOpenAI)}>
                Generic OpenAI Compatible Server
              </DropdownMenuButton>
            </DropdownMenuContent>
          </DropdownMenu>
        </AdminPageTitle>
        <ScrollableTable
          className="flex-1"
          columns={columns}
          rows={backends ?? []}
          keygen={(t) => t.id}
        />
      </div>
    </WithLoadingAndError>
  )
}

export default AllBackends
