'use client'
import { FC, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import type * as dto from '@/types/dto'
import { IconSend2 } from '@tabler/icons-react'

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
      <DialogContent className="inset-0 left-0 top-0 h-[100svh] max-h-[100svh] w-screen max-w-none translate-x-0 translate-y-0 overflow-hidden rounded-none border-0 p-0 gap-0">
        <div className="flex h-full min-h-0 flex-col">
          <div className="flex items-center justify-between border-b px-4 py-3">
            <h3 className="text-h3">{t('edit_image')}</h3>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-4">
            <div className="flex h-full items-center justify-center rounded bg-foreground/5">
              <img
                alt=""
                src={`/api/files/${attachment.id}/content`}
                className="max-h-full max-w-full object-contain"
              />
            </div>
          </div>

          <div className="px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
            <div className="mx-auto flex max-w-4xl items-center gap-2 rounded-xl border bg-background px-3 py-2">
              <Input
                placeholder={t('edit_image_prompt_placeholder')}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    handleSubmit()
                  }
                }}
                className="border-0 bg-transparent focus-visible:ring-0"
              />
              <Button variant="primary" size="icon" onClick={handleSubmit} disabled={!prompt.trim()}>
                <IconSend2 size={16} />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
