'use client'

import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { InputWithCopy } from '@/components/ui/inputwithcopy'

type Props = {
  satelliteId: string
  secret: string
  onClose: () => void
}

export const SatelliteSecretDialog = ({ satelliteId, secret, onClose }: Props) => {
  const { t } = useTranslation()

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg" onInteractOutside={(event) => event.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{t('satellite-secret')}</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{t('satellite-secret-shown-once')}</p>
        <InputWithCopy readOnly={true} value={`${satelliteId}.${secret}`} />
        <DialogFooter>
          <Button variant="secondary" onClick={onClose}>
            {t('close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
