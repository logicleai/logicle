'use client'
import { useTranslation } from 'react-i18next'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState } from 'react'
import { Column, SimpleTable, column } from '@/components/ui/tables'
import { Button } from '@/components/ui/button'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { Action, ActionList } from '@/components/ui/actionlist'
import { IconTrash, IconPlus, IconSatellite } from '@tabler/icons-react'
import { delete_, post } from '@/lib/fetch'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import toast from 'react-hot-toast'
import { useSatellites } from '@/hooks/satellites'
import { useSatelliteDiscovery } from '@/components/providers/SatelliteEventsProvider'
import * as dto from '@/types/dto'
import { Link } from '@/components/ui/link'

const MySatellitesPage = () => {
  const { t } = useTranslation()
  const { isLoading, error, data: satellites } = useSatellites()
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState<string>('')
  const modalContext = useConfirmationContext()
  const { discoverableSatellites, removeSatellite } = useSatelliteDiscovery()
  const [selectedTools, setSelectedTools] = useState<Map<string, Set<string>>>(new Map())
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

  const toggleTool = (satelliteId: string, toolName: string) => {
    setSelectedTools((prev) => {
      const newMap = new Map(prev)
      const satelliteTools = newMap.get(satelliteId) || new Set()
      if (satelliteTools.has(toolName)) {
        satelliteTools.delete(toolName)
      } else {
        satelliteTools.add(toolName)
      }
      if (satelliteTools.size === 0) {
        newMap.delete(satelliteId)
      } else {
        newMap.set(satelliteId, satelliteTools)
      }
      return newMap
    })
  }

  const saveTools = async (satelliteId: string) => {
    const toolNames = selectedTools.get(satelliteId)
    if (!toolNames || toolNames.size === 0) return

    const satellite = discoverableSatellites.find((s) => s.satelliteId === satelliteId)
    if (!satellite) return

    setSavingFor(satelliteId)
    try {
      const toolsToSave = Array.from(toolNames)
        .map((name) => satellite.tools.find((t) => t.name === name))
        .filter(Boolean) as typeof satellite.tools

      const response = await post(`/api/me/satellites/${satelliteId}/tools`, {
        tools: toolsToSave,
      })

      if (response.error) {
        toast.error(response.error.message)
        return
      }

      toast.success(t('tools-saved'))
      removeSatellite(satelliteId)
      setSelectedTools((prev) => {
        const newMap = new Map(prev)
        newMap.delete(satelliteId)
        return newMap
      })
      setExpandedSatellite(null)
    } catch (err) {
      toast.error(t('error-saving-tools'))
    } finally {
      setSavingFor(null)
    }
  }

  const filteredSatellites = (satellites ?? []).filter((satellite) => {
    if (searchTerm.trim().length === 0) return true
    if (satellite.name.toUpperCase().includes(searchTerm.toUpperCase())) return true
    return false
  })

  const registeredSatellites = filteredSatellites.filter((s) => !s.id.startsWith('ephemeral_'))
  const ephemeralSatellites = filteredSatellites.filter((s) => s.id.startsWith('ephemeral_'))

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
                  const isExpanded = expandedSatellite === satellite.id
                  const isConnected = discoverableSat !== undefined

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
                      {discoverableSat && (
                        <div className="mt-4 pt-4 border-t">
                          <button
                            onClick={() =>
                              setExpandedSatellite(isExpanded ? null : satellite.id)
                            }
                            className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium text-sm"
                          >
                            <span>📦 {discoverableSat.tools.length} new tool(s)</span>
                            <span>{isExpanded ? '▼' : '▶'}</span>
                          </button>

                          {isExpanded && (
                            <div className="mt-3 space-y-2 pl-4">
                              {discoverableSat.tools.map((tool) => (
                                <label
                                  key={tool.name}
                                  className="flex items-center gap-2 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={
                                      selectedTools.get(satellite.id)?.has(tool.name) ?? false
                                    }
                                    onChange={() => toggleTool(satellite.id, tool.name)}
                                  />
                                  <div>
                                    <div className="text-sm font-medium">{tool.name}</div>
                                    {tool.description && (
                                      <div className="text-xs text-gray-500">
                                        {tool.description}
                                      </div>
                                    )}
                                  </div>
                                </label>
                              ))}
                              <div className="flex gap-2 mt-3">
                                <Button
                                  onClick={() => saveTools(satellite.id)}
                                  disabled={
                                    !selectedTools.get(satellite.id) ||
                                    selectedTools.get(satellite.id)!.size === 0 ||
                                    savingFor === satellite.id
                                  }
                                  size="small"
                                >
                                  {savingFor === satellite.id ? t('saving') : t('save-tools')}
                                </Button>
                                <Button
                                  onClick={() => {
                                    removeSatellite(satellite.id)
                                    setExpandedSatellite(null)
                                  }}
                                  variant="secondary"
                                  size="small"
                                >
                                  {t('ignore')}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}
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
                  const isExpanded = expandedSatellite === satellite.id
                  const isConnected = discoverableSat !== undefined

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
                            Ephemeral connection • {t('created')}:{' '}
                            {new Date(satellite.createdAt).toLocaleDateString()}
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
                      {discoverableSat && (
                        <div className="mt-4 pt-4 border-t border-blue-200">
                          <button
                            onClick={() =>
                              setExpandedSatellite(isExpanded ? null : satellite.id)
                            }
                            className="flex items-center gap-2 text-blue-700 hover:text-blue-800 font-medium text-sm"
                          >
                            <span>📦 {discoverableSat.tools.length} tool(s) available</span>
                            <span>{isExpanded ? '▼' : '▶'}</span>
                          </button>

                          {isExpanded && (
                            <div className="mt-3 space-y-2 pl-4">
                              {discoverableSat.tools.map((tool) => (
                                <label
                                  key={tool.name}
                                  className="flex items-center gap-2 cursor-pointer"
                                >
                                  <input
                                    type="checkbox"
                                    checked={
                                      selectedTools.get(satellite.id)?.has(tool.name) ?? false
                                    }
                                    onChange={() => toggleTool(satellite.id, tool.name)}
                                  />
                                  <div>
                                    <div className="text-sm font-medium">{tool.name}</div>
                                    {tool.description && (
                                      <div className="text-xs text-gray-500">
                                        {tool.description}
                                      </div>
                                    )}
                                  </div>
                                </label>
                              ))}
                              <div className="flex gap-2 mt-3">
                                <Button
                                  onClick={() => saveTools(satellite.id)}
                                  disabled={
                                    !selectedTools.get(satellite.id) ||
                                    selectedTools.get(satellite.id)!.size === 0 ||
                                    savingFor === satellite.id
                                  }
                                  size="small"
                                >
                                  {savingFor === satellite.id ? t('saving') : t('approve-tools')}
                                </Button>
                                <Button
                                  onClick={() => {
                                    removeSatellite(satellite.id)
                                    setExpandedSatellite(null)
                                  }}
                                  variant="secondary"
                                  size="small"
                                >
                                  {t('ignore')}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

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
