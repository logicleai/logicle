'use client'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import toast from 'react-hot-toast'
import { post } from '@/lib/fetch'
import * as dto from '@/types/dto'

const CreateSatellite = () => {
  const { t } = useTranslation()
  const router = useRouter()
  const [name, setName] = useState<string>('')
  const [loading, setLoading] = useState(false)

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
      router.push(`/satellites/${satellite.id}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="h-full flex flex-col p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">{t('create-satellite')}</h1>
      </div>

      <form onSubmit={onSubmit} className="max-w-md space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium mb-2">
            {t('satellite-name')}
          </label>
          <Input
            id="name"
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
    </div>
  )
}

export default CreateSatellite
