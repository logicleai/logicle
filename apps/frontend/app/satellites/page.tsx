'use client'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Action, ActionList } from '@/components/ui/actionlist'
import { IconTrash, IconPlus, IconSatellite } from '@tabler/icons-react'
import { delete_, post } from '@/lib/fetch'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import toast from 'react-hot-toast'
import { useSatellites } from '@/hooks/satellites'
import { useSatelliteDiscovery } from '@/components/providers/SatelliteEventsProvider'
import { useConnectedSatellites } from '@/hooks/useConnectedSatellites'
import * as dto from '@/types/dto'
import { Link } from '@/components/ui/link'

const MySatellitesPage = () => {
  const { t } = useTranslation()
  const { isLoading, error, data: satellites } = useSatellites()
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState<string>('')
  const modalContext = useConfirmationContext()
  const { discoverableSatellites, removeSatellite } = useSatelliteDiscovery()
  const { connectedSatellites } = useConnectedSatellites()
  const [savingFor, setSavingFor] = useState<string | null>(null)
  const [expandedSatellite, setExpandedSatellite] = useState<string | null>(null)

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
    router.refresh()
    toast.success(t('satellite-successfully-deleted'))
  }

  const saveOrIgnoreTools = async (satelliteId: string, mode: 'save' | 'ignore') => {
    const satellite = discoverableSatellites.find((s) => s.satelliteId === satelliteId)
    if (!satellite) return

    if (mode === 'ignore') {
      removeSatellite(satelliteId)
      setExpandedSatellite(null)
      toast.success(t('tools-ignored'))
      return
    }

    setSavingFor(satelliteId)
    try {
      const response = await post(`/api/me/satellites/${satelliteId}/tools`, {})

      if (response.error) {
        toast.error(response.error.message)
        return
      }

      toast.success(t('tools-saved'))
      removeSatellite(satelliteId)
      setExpandedSatellite(null)
    } catch (err) {
      toast.error(t('error-saving-tools'))
    } finally {
      setSavingFor(null)
    }
  }

  const renderDiscoveryCard = (
    satelliteId: string,
    discoverableSat: (typeof discoverableSatellites)[number],
    tone: 'default' | 'ephemeral'
  ) => {
    const isExpanded = expandedSatellite === satelliteId
    const borderClass = tone === 'ephemeral' ? 'border-blue-200' : 'border-t'
    const buttonClass =
      tone === 'ephemeral'
        ? 'flex items-center gap-2 text-blue-700 hover:text-blue-800 font-medium text-sm'
        : 'flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm'
    const panelClass =
      tone === 'ephemeral'
        ? 'mt-3 rounded-xl bg-white/70 p-4'
        : 'mt-3 rounded-xl bg-slate-50 p-4'

    return (
      <div className={`mt-4 pt-4 ${borderClass}`}>
        <button
          onClick={() => setExpandedSatellite(isExpanded ? null : satelliteId)}
          className={buttonClass}
        >
          <span>{discoverableSat.tools.length} exposed capability(s)</span>
          <span>{isExpanded ? '▼' : '▶'}</span>
        </button>

        {isExpanded && (
          <div className={panelClass}>
            <p className="text-sm text-gray-600">
              This connection will be saved as one Logicle tool. The bridge currently exposes:
            </p>
            <div className="mt-3 space-y-2">
              {discoverableSat.tools.map((tool) => (
                <div
                  key={tool.name}
                  className="rounded-lg border border-black/5 bg-white px-3 py-2"
                >
                  <div className="text-sm font-medium">{tool.name}</div>
                  {tool.description && (
                    <div className="mt-1 text-xs text-gray-500">{tool.description}</div>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <Button
                onClick={() => saveOrIgnoreTools(satelliteId, 'save')}
                disabled={savingFor === satelliteId}
                size="small"
              >
                {savingFor === satelliteId ? t('saving') : 'Create Tool'}
              </Button>
              <Button
                onClick={() => saveOrIgnoreTools(satelliteId, 'ignore')}
                variant="secondary"
                size="small"
                disabled={savingFor === satelliteId}
              >
                {t('ignore')}
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const filteredSatellites = (satellites ?? []).filter((satellite) => {
    if (searchTerm.trim().length === 0) return true
    if (satellite.name.toUpperCase().includes(searchTerm.toUpperCase())) return true
    return false
  })

  const ephemeralConnectedSatellites: dto.Satellite[] = connectedSatellites
    .filter((satellite) => satellite.satelliteId.startsWith('ephemeral_'))
    .filter((satellite) => {
      if (searchTerm.trim().length === 0) return true
      return satellite.satelliteName.toUpperCase().includes(searchTerm.toUpperCase())
    })
    .map((satellite) => ({
      id: satellite.satelliteId,
      name: satellite.satelliteName,
      userId: '',
      createdAt: '',
      updatedAt: '',
    }))

  const registeredSatellites = filteredSatellites.filter((s) => !s.id.startsWith('ephemeral_'))
  const ephemeralSatellites = ephemeralConnectedSatellites

  return (
    <div className="h-full flex flex-col p-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <IconSatellite size={32} />
          <h1 className="text-2xl font-bold">{t('satellites')}</h1>
        </div>
        <p className="text-sm text-gray-600">
          Manage your connected satellites and approve tools
        </p>
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
          {/* Registered Satellites Section */}
          {registeredSatellites.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-gray-700">Registered Satellites</h2>
              <div className="space-y-3">
                {registeredSatellites.map((satellite) => {
                  const discoverableSat = discoverableSatellites.find(
                    (s) => s.satelliteId === satellite.id
                  )
                  const connectedSat = connectedSatellites.find(
                    (s) => s.satelliteId === satellite.id
                  )
                  const isConnected = connectedSat !== undefined

                  return (
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
                                isConnected
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-gray-100 text-gray-600'
                              }`}
                            >
                              {isConnected ? '● Connected' : '○ Disconnected'}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {t('created')}: {new Date(satellite.createdAt).toLocaleDateString()}
                          </div>
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

                      {/* Discovery card */}
                      {discoverableSat && renderDiscoveryCard(satellite.id, discoverableSat, 'default')}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Ephemeral Satellites Section */}
          {ephemeralSatellites.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-3 text-gray-700">Personal Bridges</h2>
              <div className="space-y-3">
                {ephemeralSatellites.map((satellite) => {
                  const discoverableSat = discoverableSatellites.find(
                    (s) => s.satelliteId === satellite.id
                  )
                  const connectedSat = connectedSatellites.find(
                    (s) => s.satelliteId === satellite.id
                  )
                  const isConnected = connectedSat !== undefined

                  return (
                    <div
                      key={satellite.id}
                      className="border rounded-lg p-4 bg-blue-50 hover:shadow-sm transition-shadow"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{satellite.name}</span>
                            <span
                              className={`text-xs px-2 py-1 rounded-full ${
                                isConnected
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-orange-100 text-orange-700'
                              }`}
                            >
                              {isConnected ? '● Connected' : '⚠ Awaiting connection'}
                            </span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            Ephemeral connection
                          </div>
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

                      {/* Discovery card for ephemeral */}
                      {discoverableSat &&
                        renderDiscoveryCard(satellite.id, discoverableSat, 'ephemeral')}

                      {!discoverableSat && (
                        <div className="mt-4 pt-4 border-t border-blue-200">
                          <p className="text-sm text-gray-600">
                            Waiting for connection... The bridge will appear here once it connects.
                          </p>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && filteredSatellites.length === 0 && (
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
