'use client'
import { FC, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type * as dto from '@/types/dto'

interface Props {
  attachment: dto.Attachment
  onClose: () => void
  onSubmit: (prompt: string, attachment: dto.Attachment) => void
}

export const ImageEditorModal: FC<Props> = ({ attachment, onClose, onSubmit }) => {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')

  const handleSubmit = () => {
    if (!prompt.trim()) return
    onSubmit(prompt.trim(), attachment)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-full">
        <DialogHeader>
          <DialogTitle>{t('edit_image')}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex justify-center overflow-auto max-h-[50vh] bg-checkerboard rounded">
            <img
              alt=""
              src={`/api/files/${attachment.id}/content`}
              className="max-w-full rounded"
              style={{ maxHeight: '45vh', objectFit: 'contain' }}
            />
          </div>

          <Textarea
            placeholder={t('edit_image_prompt_placeholder')}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
          />

          <DialogFooter>
            <Button variant="secondary" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button variant="primary" onClick={handleSubmit} disabled={!prompt.trim()}>
              {t('send')}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
