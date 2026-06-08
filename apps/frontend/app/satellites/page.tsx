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
import * as dto from '@/types/dto'
import { Link } from '@/components/ui/link'

const MySatellitesPage = () => {
  const { t } = useTranslation()
  const { isLoading, error, data: satellites } = useSatellites()
  const router = useRouter()
  const [searchTerm, setSearchTerm] = useState<string>('')
  const modalContext = useConfirmationContext()
  const [savingFor, setSavingFor] = useState<string | null>(null)
  const [expandedSatellite, setExpandedSatellite] = useState<string | null>(null)
  const [ignoredSatellites, setIgnoredSatellites] = useState<Set<string>>(new Set())

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

  const saveOrIgnoreTools = async (satellite: dto.SatelliteListItem, mode: 'save' | 'ignore') => {
    if (mode === 'ignore') {
      setIgnoredSatellites((prev) => new Set(prev).add(satellite.id))
      setExpandedSatellite(null)
      toast.success(t('tools-ignored'))
      return
    }

    setSavingFor(satellite.id)
    try {
      const response = await post(`/api/me/satellites/${satellite.id}/tools`, {})

      if (response.error) {
        toast.error(response.error.message)
        return
      }

      setIgnoredSatellites((prev) => {
        const next = new Set(prev)
        next.delete(satellite.id)
        return next
      })
      setExpandedSatellite(null)
      toast.success(t('tools-saved'))
      router.refresh()
    } catch {
      toast.error(t('error-saving-tools'))
    } finally {
      setSavingFor(null)
    }
  }

  const renderDiscoveryCard = (satellite: dto.SatelliteListItem, tone: 'default' | 'ephemeral') => {
    const isExpanded = expandedSatellite === satellite.id
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
          onClick={() => setExpandedSatellite(isExpanded ? null : satellite.id)}
          className={buttonClass}
        >
          <span>{satellite.discoverableTools.length} exposed capability(s)</span>
          <span>{isExpanded ? '▼' : '▶'}</span>
        </button>

        {isExpanded && (
          <div className={panelClass}>
            <p className="text-sm text-gray-600">
              This connection will be saved as one Logicle tool. The bridge currently exposes:
            </p>
            <div className="mt-3 space-y-2">
              {satellite.discoverableTools.map((tool) => (
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
                onClick={() => saveOrIgnoreTools(satellite, 'save')}
                disabled={savingFor === satellite.id}
                size="small"
              >
                {savingFor === satellite.id ? t('saving') : 'Create Tool'}
              </Button>
              <Button
                onClick={() => saveOrIgnoreTools(satellite, 'ignore')}
                variant="secondary"
                size="small"
                disabled={savingFor === satellite.id}
              >
                {t('ignore')}
              </Button>
            </div>
          </div>
        )}
      </div>
    )
  }

  const visibleSatellites = (satellites ?? []).filter((satellite) => {
    if (searchTerm.trim().length > 0 && !satellite.name.toUpperCase().includes(searchTerm.toUpperCase())) {
      return false
    }
    if (satellite.discoverableTools.length > 0 && ignoredSatellites.has(satellite.id)) {
      return false
    }
    return true
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

                    {satellite.discoverableTools.length > 0 && renderDiscoveryCard(satellite, 'default')}
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
                          <span
                            className={`text-xs px-2 py-1 rounded-full ${
                              satellite.connected
                                ? 'bg-green-100 text-green-700'
                                : 'bg-orange-100 text-orange-700'
                            }`}
                          >
                            {satellite.connected ? '● Connected' : '⚠ Awaiting connection'}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1">Ephemeral connection</div>
                      </div>
                    </div>

                    {satellite.discoverableTools.length > 0 ? (
                      renderDiscoveryCard(satellite, 'ephemeral')
                    ) : (
                      <div className="mt-4 pt-4 border-t border-blue-200">
                        <p className="text-sm text-gray-600">
                          Waiting for connection... The bridge will appear here once it connects.
                        </p>
                      </div>
                    )}
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
