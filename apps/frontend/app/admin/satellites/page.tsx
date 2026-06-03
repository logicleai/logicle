'use client'
import { useTranslation } from 'react-i18next'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Column, SimpleTable, column } from '@/components/ui/tables'
import { Button } from '@/components/ui/button'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { AdminPage } from '../components/AdminPage'
import { Action, ActionList } from '@/components/ui/actionlist'
import { IconTrash, IconPlus } from '@tabler/icons-react'
import { delete_ } from '@/lib/fetch'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import toast from 'react-hot-toast'
import { useSatellites } from '@/hooks/satellites'
import { useDiscoverSatelliteTools } from '@/hooks/useDiscoverSatelliteTools'
import { SatelliteToolsDiscoveryModal } from '@/components/admin/SatelliteToolsDiscoveryModal'
import * as dto from '@/types/dto'
import { Link } from '@/components/ui/link'

const AllSatellites = () => {
  const { t } = useTranslation()
  const { isLoading, error, data: satellites } = useSatellites()
  const router = useRouter()
  const searchParams = useSearchParams()
  const showDiscovery = searchParams.get('discovery') === 'true'
  const [searchTerm, setSearchTerm] = useState<string>('')
  const modalContext = useConfirmationContext()
  const { discoverableSatellites, removeSatellite } = useDiscoverSatelliteTools()

  async function onDelete(satellite: dto.Satellite) {
    const result = await modalContext.askConfirmation({
      title: `${t('remove-satellite')} ${satellite?.name}`,
      message: t('remove-satellite-confirmation'),
      confirmMsg: t('remove-satellite'),
    })
    if (!result) return

    const response = await delete_(`/api/me/satellites/${satellite.id}`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    // Refresh the list
    router.refresh()
    toast.success(t('satellite-successfully-deleted'))
  }

  const columns: Column<dto.Satellite>[] = [
    column(t('table-column-name'), (satellite) => (
      <Link variant="ghost" href={`/admin/satellites/${satellite.id}`}>
        {satellite.name}
      </Link>
    )),
    column(t('created'), (satellite) => (
      <span>{new Date(satellite.createdAt).toLocaleDateString()}</span>
    )),
    column(t('table-column-actions'), (satellite) => (
      <ActionList>
        <Action
          icon={IconTrash}
          onClick={async () => {
            await onDelete(satellite)
          }}
          text={t('remove-satellite')}
          destructive={true}
        />
      </ActionList>
    )),
  ]

  function onCreateSatellite() {
    router.push('/admin/satellites/create')
  }

  function openDiscoveryModal() {
    router.push('/admin/satellites?discovery=true')
  }

  function closeDiscoveryModal() {
    router.push('/admin/satellites')
  }

  return (
    <AdminPage
      isLoading={isLoading}
      error={error}
      title={t('all-satellites')}
      topBar={
        <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
          <Button onClick={onCreateSatellite}>
            {t('create-satellite')}
          </Button>
        </SearchBarWithButtonsOnRight>
      }
    >
      <SatelliteToolsDiscoveryModal
        isOpen={showDiscovery}
        satellites={discoverableSatellites}
        onSaved={(satelliteId) => {
          removeSatellite(satelliteId)
          if (discoverableSatellites.length === 1) {
            closeDiscoveryModal()
          }
        }}
      />
      <SimpleTable
        className="flex-1"
        columns={columns}
        rows={(satellites ?? []).filter((satellite) => {
          if (searchTerm.trim().length === 0) return true
          if (satellite.name.toUpperCase().includes(searchTerm.toUpperCase())) return true
          return false
        })}
        keygen={(s) => s.id}
      />
    </AdminPage>
  )
}

export default AllSatellites
