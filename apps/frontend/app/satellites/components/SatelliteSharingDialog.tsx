'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { patch } from '@/lib/fetch'
import { mutateSatellites, mutateAdminSatellites } from '@/hooks/satellites'
import * as dto from '@/types/dto'
import { SatelliteSharingFields } from './SatelliteSharingFields'

interface Props {
  scope?: 'me' | 'admin'
  satellite: dto.Satellite
  onClose: () => void
  onSaved: (satellite: dto.Satellite) => void
}

export const SatelliteSharingDialog = ({ scope = 'me', satellite, onClose, onSaved }: Props) => {
  const { t } = useTranslation()
  const [sharing, setSharing] = useState<dto.Sharing2>(satellite.sharing)
  const [saving, setSaving] = useState(false)

  async function onSave() {
    setSaving(true)
    try {
      const url = `${scope === 'admin' ? '/api/satellites' : '/api/me/satellites'}/${satellite.id}`
      const response = await patch<dto.Satellite>(url, { sharing })
      if (response.error) {
        toast.error(response.error.message)
        return
      }
      await Promise.all([mutateAdminSatellites(), mutateSatellites()])
      onSaved(response.data as dto.Satellite)
      toast.success(t('saved'))
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="flex flex-col">
        <DialogHeader>
          <DialogTitle>{t('sharing')}</DialogTitle>
        </DialogHeader>
        <SatelliteSharingFields sharing={sharing} onChange={setSharing} disabled={saving} />
        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            onClick={onSave}
            disabled={saving || (sharing.type === 'workspace' && sharing.workspaces.length === 0)}
          >
            {saving ? t('saving') : t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
