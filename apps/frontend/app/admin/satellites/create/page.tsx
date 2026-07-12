'use client'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AdminPage } from '../../components/AdminPage'
import toast from 'react-hot-toast'
import { post } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { SatelliteSecretDialog } from '@/app/satellites/components/SatelliteSecretDialog'

const CreateSatellite = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const nameId = useId()
  const [name, setName] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [createdSatellite, setCreatedSatellite] = useState<dto.Satellite | null>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) {
      toast.error(t('satellite-name-required'))
      return
    }

    setLoading(true)
    try {
      const response = await post('/api/me/satellites', {
        name: name.trim(),
      })

      if (response.error) {
        toast.error(response.error.message)
        return
      }

      const satellite = response.data as dto.Satellite
      toast.success(t('satellite-created'))
      setCreatedSatellite(satellite)
    } finally {
      setLoading(false)
    }
  }

  if (createdSatellite) {
    return (
      <SatelliteSecretDialog
        satelliteId={createdSatellite.id}
        secret={createdSatellite.secret ?? ''}
        onClose={() => router.push(`/admin/satellites/${createdSatellite.id}`)}
      />
    )
  }

  return (
    <AdminPage title={t('create-satellite')}>
      <form onSubmit={onSubmit} className="max-w-md space-y-4">
        <div>
          <label htmlFor={nameId} className="block text-sm font-medium mb-2">
            {t('satellite-name')}
          </label>
          <Input
            id={nameId}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('satellite-name-placeholder')}
            disabled={loading}
          />
        </div>
        <div className="flex gap-2">
          <Button type="submit" disabled={loading}>
            {loading ? t('creating') : t('create')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => router.back()}
            disabled={loading}
          >
            {t('cancel')}
          </Button>
        </div>
      </form>
    </AdminPage>
  )
}

export default CreateSatellite
