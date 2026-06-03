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
import { delete_, post } from '@/lib/fetch'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import toast from 'react-hot-toast'
import { useSatellites } from '@/hooks/satellites'
import { useSatelliteDiscovery } from '@/components/providers/SatelliteEventsProvider'
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
    // Refresh the list
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

  const filteredSatellites = (satellites ?? []).filter((satellite) => {
    if (searchTerm.trim().length === 0) return true
    if (satellite.name.toUpperCase().includes(searchTerm.toUpperCase())) return true
    return false
  })

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

      <div className="space-y-4">
        {filteredSatellites.map((satellite) => {
          const discoverableSat = discoverableSatellites.find((s) => s.satelliteId === satellite.id)
          const isExpanded = expandedSatellite === satellite.id

          return (
            <div key={satellite.id}>
              {/* Satellite card */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <Link variant="ghost" href={`/admin/satellites/${satellite.id}`}>
                      {satellite.name}
                    </Link>
                    <div className="text-sm text-gray-500 mt-1">
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
                      onClick={() => setExpandedSatellite(isExpanded ? null : satellite.id)}
                      className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium"
                    >
                      <span>📦 {discoverableSat.tools.length} tool disponibili per scoprire</span>
                      <span>{isExpanded ? '▼' : '▶'}</span>
                    </button>

                    {isExpanded && (
                      <div className="mt-3 space-y-2 pl-4">
                        {discoverableSat.tools.map((tool) => (
                          <label key={tool.name} className="flex items-center gap-2 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedTools.get(satellite.id)?.has(tool.name) ?? false}
                              onChange={() => toggleTool(satellite.id, tool.name)}
                            />
                            <div>
                              <div className="text-sm font-medium">{tool.name}</div>
                              {tool.description && (
                                <div className="text-xs text-gray-500">{tool.description}</div>
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
            </div>
          )
        })}
      </div>
    </AdminPage>
  )
}

export default AllSatellites
