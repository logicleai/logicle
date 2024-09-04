'use client'
import { useTranslation } from 'next-i18next'
import { mutateBackends, useBackends } from '@/hooks/backends'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { Column, ScrollableTable, column } from '@/components/ui/tables'
import toast from 'react-hot-toast'
import { delete_ } from '@/lib/fetch'
import { masked } from '@/types/secure'
import { Link } from '@/components/ui/link'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuButton,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { ProviderType } from '@/types/provider'
import { Metadata } from 'next'
import * as dto from '@/types/dto'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { useState } from 'react'
import { AdminPage } from '../components/AdminPage'
import { IconTrash } from '@tabler/icons-react'
import { ActionList } from '@/components/ui/actionlist'
import { useEnvironment } from '@/app/context/environmentProvider'

export const metadata: Metadata = {
  title: 'Backends',
}

export const BackendsPage = () => {
  const { t } = useTranslation('common')
  const { isLoading, error, data: backends } = useBackends()
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState<string>('')

  const environment = useEnvironment()
  const modalContext = useConfirmationContext()
  async function onDelete(backend: dto.Backend) {
    const result = await modalContext.askConfirmation({
      title: `${t('remove-backend')} ${backend?.name}`,
      message: t('remove-backend-confirmation'),
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

  const columns: Column<dto.Backend>[] = [
    column(t('table-column-name'), (backend) => (
      <Link variant="ghost" href={`/admin/backends/${backend.id}`}>
        {backend.name}
      </Link>
    )),
    column(t('table-column-apikey'), (backend) => masked(backend.apiKey, '.', 3)),
    column(t('table-column-apiendpoint'), (backend) => backend.endPoint),
  ]
  if (!environment.backendConfigLock) {
    columns.push(
      column(t('table-column-actions'), (backend) => (
        <ActionList
          actions={[
            {
              icon: IconTrash,
              onClick: () => {
                onDelete(backend)
              },
              text: t('remove-backend'),
              destructive: true,
            },
          ]}
        />
      ))
    )
  }
  async function onProviderSelect(providerType: ProviderType) {
    const queryString = new URLSearchParams({
      providerType: providerType.toString(),
    }).toString()
    const url = `/admin/backends/create?${queryString}`
    router.push(url)
  }

  return (
    <AdminPage isLoading={isLoading} error={error} title={t('all-backends')}>
      <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
        {!environment.backendConfigLock && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button disabled={environment.backendConfigLock}>{t('create_backend')}</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="" sideOffset={5}>
              <DropdownMenuButton onClick={() => onProviderSelect(ProviderType.OpenAI)}>
                {t('openai-backend')}
              </DropdownMenuButton>
              <DropdownMenuButton onClick={() => onProviderSelect(ProviderType.Anthropic)}>
                {t('anthropic-backend')}
              </DropdownMenuButton>{' '}
              <DropdownMenuButton onClick={() => onProviderSelect(ProviderType.LogicleCloud)}>
                {t('logiclecloud-backend')}
              </DropdownMenuButton>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </SearchBarWithButtonsOnRight>
      <ScrollableTable
        className="flex-1"
        columns={columns}
        rows={(backends ?? []).filter(
          (u) =>
            searchTerm.trim().length == 0 || u.name.toUpperCase().includes(searchTerm.toUpperCase())
        )}
        keygen={(t) => t.id}
      />
    </AdminPage>
  )
}
