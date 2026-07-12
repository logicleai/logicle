'use client'

import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { post, patch } from '@/lib/fetch'
import { mutateSatellites, mutateAdminSatellites } from '@/hooks/satellites'
import * as dto from '@/types/dto'
import { SatelliteSecretDialog } from './SatelliteSecretDialog'

type Props = {
  mode: 'create' | 'rename'
  scope?: 'me' | 'admin'
  satellite?: dto.Satellite | dto.SatelliteListItem
  onClose: () => void
  onSaved?: (satellite: dto.Satellite) => void
}

export const SatelliteDialog = ({ mode, scope = 'me', satellite, onClose, onSaved }: Props) => {
  const { t } = useTranslation()
  const nameId = useId()
  const [name, setName] = useState(satellite?.name ?? '')
  const [loading, setLoading] = useState(false)
  const [createdSatellite, setCreatedSatellite] = useState<dto.Satellite | null>(null)

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()
    const trimmedName = name.trim()
    if (!trimmedName) {
      toast.error(t('satellite-name-required'))
      return
    }

    setLoading(true)
    try {
      const response =
        mode === 'create'
          ? await post<dto.Satellite>('/api/me/satellites', { name: trimmedName })
          : await patch<dto.Satellite>(
              `${scope === 'admin' ? '/api/satellites' : '/api/me/satellites'}/${satellite?.id}`,
              { name: trimmedName }
            )

      if (response.error) {
        toast.error(response.error.message)
        return
      }

      const savedSatellite = response.data as dto.Satellite
      await (scope === 'admin' ? mutateAdminSatellites() : mutateSatellites())
      onSaved?.(savedSatellite)

      if (mode === 'create') {
        setCreatedSatellite(savedSatellite)
      } else {
        toast.success(t('saved'))
        onClose()
      }
    } finally {
      setLoading(false)
    }
  }

  if (createdSatellite) {
    return (
      <SatelliteSecretDialog
        satelliteId={createdSatellite.id}
        secret={createdSatellite.secret ?? ''}
        onClose={onClose}
      />
    )
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" onInteractOutside={(event) => event.preventDefault()}>
        <form onSubmit={onSubmit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{t(mode === 'create' ? 'create-satellite' : 'rename')}</DialogTitle>
          </DialogHeader>
          <div>
            <label htmlFor={nameId} className="block text-sm font-medium mb-2">
              {t('satellite-name')}
            </label>
            <Input
              id={nameId}
              type="text"
              autoComplete="off"
              data-1p-ignore="true"
              data-lpignore="true"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder={t('satellite-name-placeholder')}
              disabled={loading}
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? t(mode === 'create' ? 'creating' : 'saving') : t(mode === 'create' ? 'create' : 'save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
