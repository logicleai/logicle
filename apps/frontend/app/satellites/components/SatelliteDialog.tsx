'use client'

import { useId, useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { post, patch } from '@/lib/fetch'
import { mutateSatellites } from '@/hooks/satellites'
import * as dto from '@/types/dto'

type Props = {
  mode: 'create' | 'rename'
  satellite?: dto.Satellite | dto.SatelliteListItem
  onClose: () => void
  onSaved?: (satellite: dto.Satellite) => void
}

export const SatelliteDialog = ({ mode, satellite, onClose, onSaved }: Props) => {
  const { t } = useTranslation()
  const nameId = useId()
  const [name, setName] = useState(satellite?.name ?? '')
  const [loading, setLoading] = useState(false)

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
          : await patch<dto.Satellite>(`/api/me/satellites/${satellite?.id}`, { name: trimmedName })

      if (response.error) {
        toast.error(response.error.message)
        return
      }

      const savedSatellite = response.data as dto.Satellite
      await mutateSatellites()
      toast.success(t(mode === 'create' ? 'satellite-created' : 'saved'))
      onSaved?.(savedSatellite)
      onClose()
    } finally {
      setLoading(false)
    }
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
