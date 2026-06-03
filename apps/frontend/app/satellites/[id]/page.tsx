'use client'
import { useTranslation } from 'react-i18next'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'
import { get, post, delete_ } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { Badge } from '@/components/ui/badge'
import { IconCopy, IconTrash, IconPlus } from '@tabler/icons-react'
import { Action, ActionList } from '@/components/ui/actionlist'
import { Column, SimpleTable, column } from '@/components/ui/tables'

const SatelliteDetail = () => {
  const { t } = useTranslation()
  const params = useParams()
  const router = useRouter()
  const satelliteId = params.id as string

  const [satellite, setSatellite] = useState<dto.Satellite | null>(null)
  const [apiKeys, setApiKeys] = useState<dto.ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [showNewKeyForm, setShowNewKeyForm] = useState(false)
  const [newKeyLabel, setNewKeyLabel] = useState('')
  const [newKey, setNewKey] = useState<string | null>(null)

  useEffect(() => {
    loadSatellite()
  }, [satelliteId])

  async function loadSatellite() {
    try {
      const response = await get(`/api/me/satellites/${satelliteId}`)
      if (response.error) {
        toast.error(response.error.message)
        return
      }
      setSatellite(response.data as dto.Satellite)
      loadApiKeys()
    } finally {
      setLoading(false)
    }
  }

  async function loadApiKeys() {
    try {
      const response = await get(`/api/me/satellites/${satelliteId}/api-keys`)
      if (response.error) {
        toast.error(response.error.message)
        return
      }
      setApiKeys(response.data as dto.ApiKey[])
    } catch (err) {
      toast.error(t('error-loading-api-keys'))
    }
  }

  async function onCreateApiKey(e: React.FormEvent) {
    e.preventDefault()
    try {
      const response = await post(`/api/me/satellites/${satelliteId}/api-keys`, {
        label: newKeyLabel || undefined,
      })
      if (response.error) {
        toast.error(response.error.message)
        return
      }
      const apiKey = response.data as dto.ApiKey
      setNewKey(`${apiKey.id}.${apiKey.key}`)
      setApiKeys([...apiKeys, { ...apiKey, key: '<hidden>' }])
      setShowNewKeyForm(false)
      setNewKeyLabel('')
      toast.success(t('api-key-created'))
    } catch (err) {
      toast.error(t('error-creating-api-key'))
    }
  }

  async function onDeleteApiKey(keyId: string) {
    try {
      const response = await delete_(`/api/me/apikeys/${keyId}`)
      if (response.error) {
        toast.error(response.error.message)
        return
      }
      setApiKeys(apiKeys.filter((k) => k.id !== keyId))
      toast.success(t('api-key-deleted'))
    } catch (err) {
      toast.error(t('error-deleting-api-key'))
    }
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div>{t('loading')}</div>
      </div>
    )
  }

  if (!satellite) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <p className="text-gray-500 mb-4">{t('satellite-not-found')}</p>
        <Button onClick={() => router.back()}>{t('back')}</Button>
      </div>
    )
  }

  const columns: Column<dto.ApiKey>[] = [
    column(t('description'), (key) => <span>{key.description}</span>),
    column(t('created'), (key) => (
      <span>{new Date(key.createdAt).toLocaleDateString()}</span>
    )),
    column(t('table-column-actions'), (key) => (
      <ActionList>
        <Action
          icon={IconTrash}
          onClick={async () => {
            await onDeleteApiKey(key.id)
          }}
          text={t('delete')}
          destructive={true}
        />
      </ActionList>
    )),
  ]

  const isEphemeral = satellite.id.startsWith('ephemeral_')

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{satellite.name}</h1>
          <p className="text-sm text-gray-600 mt-1">
            {isEphemeral ? 'Personal Bridge' : 'Registered Satellite'}
          </p>
        </div>
        <Button variant="ghost" onClick={() => router.back()}>
          {t('back')}
        </Button>
      </div>

      <div className="space-y-6">
        <div className="border rounded-lg p-4">
          <h2 className="text-lg font-semibold mb-4">{t('satellite-details')}</h2>
          <div className="space-y-2">
            <div>
              <span className="text-sm font-medium">{t('name')}:</span> {satellite.name}
            </div>
            <div>
              <span className="text-sm font-medium">{t('id')}:</span>
              <code className="ml-2 bg-gray-100 px-2 py-1 rounded text-xs">
                {satellite.id}
              </code>
            </div>
            <div>
              <span className="text-sm font-medium">{t('created')}:</span>{' '}
              {new Date(satellite.createdAt).toLocaleDateString()}
            </div>
          </div>
        </div>

        {!isEphemeral && (
          <div className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">{t('api-keys')}</h2>
              {!showNewKeyForm && (
                <Button onClick={() => setShowNewKeyForm(true)} size="small">
                  {t('create-api-key')}
                </Button>
              )}
            </div>

            {showNewKeyForm && (
              <form onSubmit={onCreateApiKey} className="mb-4 p-3 border rounded bg-gray-50">
                <div className="space-y-2 mb-3">
                  <label htmlFor="label" className="block text-sm font-medium">
                    {t('label')} {t('optional')}
                  </label>
                  <Input
                    id="label"
                    type="text"
                    value={newKeyLabel}
                    onChange={(e) => setNewKeyLabel(e.target.value)}
                    placeholder={t('api-key-label-placeholder')}
                  />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="small">
                    {t('create')}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setShowNewKeyForm(false)}
                    size="small"
                  >
                    {t('cancel')}
                  </Button>
                </div>
              </form>
            )}

            {newKey && (
              <div className="mb-4 p-3 border rounded bg-yellow-50 border-yellow-200">
                <p className="text-sm font-medium mb-2">{t('save-your-api-key')}</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-white px-2 py-1 rounded text-sm border border-gray-300 font-mono">
                    {newKey}
                  </code>
                  <Button
                    variant="ghost"
                    size="small"
                    onClick={() => {
                      navigator.clipboard.writeText(newKey)
                      toast.success(t('copied-to-clipboard'))
                    }}
                  />
                </div>
              </div>
            )}

            {apiKeys.length > 0 ? (
              <SimpleTable columns={columns} rows={apiKeys} keygen={(k) => k.id} />
            ) : (
              <p className="text-gray-500 text-sm">{t('no-api-keys')}</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default SatelliteDetail
