'use client'
import { useTranslation } from 'react-i18next'
import { useRouter, useParams } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useSatellite } from '@/hooks/satellites'
import { SatelliteDialog } from '../components/SatelliteDialog'

const SatelliteDetail = () => {
  const { t } = useTranslation()
  const params = useParams()
  const router = useRouter()
  const satelliteId = params.id as string
  const { data: satellite, isLoading: loading } = useSatellite(satelliteId)
  const [renamingSatellite, setRenamingSatellite] = useState(false)

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

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{satellite.name}</h1>
          <p className="text-sm text-gray-600 mt-1">Registered Satellite</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setRenamingSatellite(true)}>
            {t('rename')}
          </Button>
          <Button variant="ghost" onClick={() => router.back()}>
            {t('back')}
          </Button>
        </div>
      </div>

      <div className="border rounded-lg p-4">
        <h2 className="text-lg font-semibold mb-4">{t('satellite-details')}</h2>
        <div className="space-y-2">
          <div>
            <span className="text-sm font-medium">{t('name')}:</span> {satellite.name}
          </div>
          <div>
            <span className="text-sm font-medium">{t('id')}:</span>
            <code className="ml-2 bg-gray-100 px-2 py-1 rounded text-xs">{satellite.id}</code>
          </div>
          <div>
            <span className="text-sm font-medium">{t('created')}:</span>{' '}
            {new Date(satellite.createdAt).toLocaleDateString()}
          </div>
        </div>
      </div>
      {renamingSatellite && (
        <SatelliteDialog
          mode="rename"
          satellite={satellite}
          onClose={() => setRenamingSatellite(false)}
        />
      )}
    </div>
  )
}

export default SatelliteDetail
