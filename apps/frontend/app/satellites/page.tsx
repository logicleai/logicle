'use client'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Action, ActionList } from '@/components/ui/actionlist'
import { IconTrash, IconPlus, IconSatellite } from '@tabler/icons-react'
import { delete_ } from '@/lib/fetch'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import toast from 'react-hot-toast'
import { useSatellites } from '@/hooks/satellites'
import * as dto from '@/types/dto'
import { Link } from '@/components/ui/link'

const MySatellitesPage = () => {
  const { t } = useTranslation()
  const { isLoading, error, data: satellites } = useSatellites()
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState<string>('')
  const modalContext = useConfirmationContext()

  async function onDelete(satellite: dto.SatelliteListItem) {
    if (satellite.kind === 'ephemeral') {
      toast.error('Ephemeral bridges disappear when the remote connection closes')
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
    router.refresh()
    toast.success(t('satellite-successfully-deleted'))
  }

  const visibleSatellites = (satellites ?? []).filter((satellite) => {
    if (searchTerm.trim().length === 0) return true
    return satellite.name.toUpperCase().includes(searchTerm.toUpperCase())
  })

  const registeredSatellites = visibleSatellites.filter((s) => s.kind === 'registered')
  const ephemeralSatellites = visibleSatellites.filter((s) => s.kind === 'ephemeral')

  return (
    <div className="h-full flex flex-col p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <IconSatellite size={32} />
          <h1 className="text-2xl font-bold">{t('satellites')}</h1>
        </div>
        <p className="text-sm text-gray-600">Manage your registered satellites and live bridge connections</p>
      </div>

      <div className="mb-4 flex gap-2">
        <div className="flex-1">
          <input
            type="text"
            placeholder={t('search')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full px-3 py-2 border rounded-lg text-sm"
          />
        </div>
        <Button onClick={() => router.push('/satellites/create')}>
          <IconPlus size={16} className="mr-2" />
          {t('create-satellite')}
        </Button>
      </div>

      {isLoading && <div className="text-center text-gray-500">{t('loading')}</div>}
      {error && <div className="text-center text-red-500">{error}</div>}

      {!isLoading && !error && (
        <div className="flex-1 overflow-y-auto space-y-6">
          {registeredSatellites.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-gray-700">Registered Satellites</h2>
              <div className="space-y-3">
                {registeredSatellites.map((satellite) => (
                  <div
                    key={satellite.id}
                    className="border rounded-lg p-4 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Link variant="ghost" href={`/satellites/${satellite.id}`}>
                            {satellite.name}
                          </Link>
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              satellite.connected
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-600'
                            }`}
                          >
                            {satellite.connected ? '● Connected' : '○ Disconnected'}
                          </span>
                        </div>
                        {satellite.createdAt && (
                          <div className="text-xs text-gray-500 mt-1">
                            {t('created')}: {new Date(satellite.createdAt).toLocaleDateString()}
                          </div>
                        )}
                      </div>
                      <ActionList>
                        <Action
                          icon={IconTrash}
                          onClick={() => onDelete(satellite)}
                          text={t('remove-satellite')}
                          destructive={true}
                        />
                      </ActionList>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {ephemeralSatellites.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-gray-700">Personal Bridges</h2>
              <div className="space-y-3">
                {ephemeralSatellites.map((satellite) => (
                  <div
                    key={satellite.id}
                    className="border rounded-lg p-4 bg-blue-50 hover:shadow-sm transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{satellite.name}</span>
                          <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">
                            ● Connected
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Ephemeral connection</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!isLoading && visibleSatellites.length === 0 && (
            <div className="text-center py-12">
              <IconSatellite size={48} className="mx-auto text-gray-300 mb-4" />
              <p className="text-gray-500">{t('no-satellites')}</p>
              <Button onClick={() => router.push('/satellites/create')} className="mt-4">
                {t('create-satellite')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default MySatellitesPage
