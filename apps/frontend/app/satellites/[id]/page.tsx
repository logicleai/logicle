'use client'
import { useTranslation } from 'react-i18next'
import { useRouter, useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'
import { get } from '@/lib/fetch'
import * as dto from '@/types/dto'

const SatelliteDetail = () => {
  const { t } = useTranslation()
  const params = useParams()
  const router = useRouter()
  const satelliteId = params.id as string

  const [satellite, setSatellite] = useState<dto.Satellite | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void loadSatellite()
  }, [satelliteId])

  async function loadSatellite() {
    try {
      const response = await get(`/api/me/satellites/${satelliteId}`)
      if (response.error) {
        toast.error(response.error.message)
        return
      }
      setSatellite(response.data as dto.Satellite)
    } finally {
      setLoading(false)
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

  return (
    <div className="h-full flex flex-col p-6 overflow-y-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{satellite.name}</h1>
          <p className="text-sm text-gray-600 mt-1">Registered Satellite</p>
        </div>
        <Button variant="ghost" onClick={() => router.back()}>
          {t('back')}
        </Button>
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
    </div>
  )
}

export default SatelliteDetail
