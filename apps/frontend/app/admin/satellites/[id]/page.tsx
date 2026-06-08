'use client'
import { useTranslation } from 'react-i18next'
import { useParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import { AdminPage } from '../../components/AdminPage'
import toast from 'react-hot-toast'
import { get } from '@/lib/fetch'
import * as dto from '@/types/dto'

const SatelliteDetail = () => {
  const { t } = useTranslation()
  const params = useParams()
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
    return <AdminPage title={t('loading')}>{t('loading')}</AdminPage>
  }

  if (!satellite) {
    return <AdminPage title={t('not-found')}>{t('satellite-not-found')}</AdminPage>
  }

  return (
    <AdminPage title={satellite.name}>
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
    </AdminPage>
  )
}

export default SatelliteDetail
