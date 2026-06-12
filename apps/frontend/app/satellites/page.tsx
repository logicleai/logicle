'use client'
import { useTranslation } from 'react-i18next'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Action, ActionList } from '@/components/ui/actionlist'
import { IconTrash, IconPlus, IconSatellite, IconPencil } from '@tabler/icons-react'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { delete_ } from '@/lib/fetch'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import toast from 'react-hot-toast'
import { mutateSatellites, useSatellites } from '@/hooks/satellites'
import * as dto from '@/types/dto'
import { Link } from '@/components/ui/link'
import { AdminPage } from '@/app/admin/components/AdminPage'
import { SatelliteDialog } from './components/SatelliteDialog'

const MySatellitesPage = () => {
  const { t } = useTranslation()
  const { isLoading, error, data: satellites } = useSatellites()
  const [searchTerm, setSearchTerm] = useState<string>('')
  const [creatingSatellite, setCreatingSatellite] = useState(false)
  const [renamingSatellite, setRenamingSatellite] = useState<dto.SatelliteListItem | null>(null)
  const modalContext = useConfirmationContext()

  async function onDelete(satellite: dto.SatelliteListItem) {
    if (satellite.kind === 'ephemeral') {
      toast.error(t('ephemeral-bridge-disappear-warning'))
      return
    }

    const result = await modalContext.askConfirmation({
      title: `${t('remove-satellite')} ${satellite.name}`,
      message: t('remove-satellite-confirmation'),
      confirmMsg: t('remove-satellite'),
    })
    if (!result) return

    const response = await delete_(`/api/me/satellites/${satellite.id}`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    await mutateSatellites()
    toast.success(t('satellite-successfully-deleted'))
  }

  const visibleSatellites = (satellites ?? []).filter((satellite) => {
    if (searchTerm.trim().length === 0) return true
    return satellite.name.toUpperCase().includes(searchTerm.toUpperCase())
  })

  return (
    <AdminPage
      isLoading={isLoading}
      error={error}
      title={t('satellites')}
      topBar={
        <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
          <Button onClick={() => setCreatingSatellite(true)}>
            <IconPlus size={16} className="mr-2" />
            {t('create-satellite')}
          </Button>
        </SearchBarWithButtonsOnRight>
      }
    >
      <div className="mt-4">
      {visibleSatellites.length === 0 ? (
        <div className="text-center py-12">
          <IconSatellite size={48} className="mx-auto text-gray-300 mb-4" />
          {(satellites ?? []).length === 0 ? (
            <>
              <p className="text-gray-500">{t('no-satellites')}</p>
              <Button onClick={() => setCreatingSatellite(true)} className="mt-4">
                {t('create-satellite')}
              </Button>
            </>
          ) : (
            <p className="text-gray-500">{t('no-results')}</p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleSatellites.map((satellite) => (
            <div
              key={satellite.id}
              className="border rounded-lg p-4 hover:shadow-sm transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  {satellite.kind === 'registered' ? (
                    <Link variant="ghost" href={`/satellites/${satellite.id}`}>
                      {satellite.name}
                    </Link>
                  ) : (
                    <span className="font-medium">{satellite.name}</span>
                  )}
                  <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600">
                    {t(satellite.kind)}
                  </span>
                  <span
                    className={`text-xs px-2 py-1 rounded-full ${
                      satellite.connected
                        ? 'bg-green-100 text-green-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {satellite.connected ? `● ${t('connected')}` : `○ ${t('disconnected')}`}
                  </span>
                </div>
                {satellite.kind === 'registered' && (
                  <ActionList>
                    <Action
                      icon={IconPencil}
                      onClick={() => setRenamingSatellite(satellite)}
                      text={t('rename')}
                    />
                    <Action
                      icon={IconTrash}
                      onClick={() => onDelete(satellite)}
                      text={t('remove-satellite')}
                      destructive={true}
                    />
                  </ActionList>
                )}
              </div>
              {satellite.createdAt && (
                <div className="text-xs text-gray-500 mt-1">
                  {t('created')}: {new Date(satellite.createdAt).toLocaleDateString()}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </div>
      {creatingSatellite && (
        <SatelliteDialog mode="create" onClose={() => setCreatingSatellite(false)} />
      )}
      {renamingSatellite && (
        <SatelliteDialog
          mode="rename"
          satellite={renamingSatellite}
          onClose={() => setRenamingSatellite(null)}
        />
      )}
    </AdminPage>
  )
}

export default MySatellitesPage
