'use client'
import { FC, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type * as dto from '@/types/dto'
import { IconSend2 } from '@tabler/icons-react'

const STORAGE_KEY = 'imageEditAssistantId'

function resolveInitialAssistant(assistants: dto.UserAssistant[]): string {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored && assistants.some((a) => a.id === stored)) return stored
  return assistants[0]?.id ?? ''
}

interface Props {
  attachment: dto.Attachment
  assistants?: dto.UserAssistant[]
  onClose: () => void
  onSubmit: (prompt: string, attachment: dto.Attachment, assistantId?: string) => void
}

export const ImageEditorModal: FC<Props> = ({ attachment, assistants, onClose, onSubmit }) => {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [assistantId, setAssistantId] = useState<string>(() =>
    assistants?.length ? resolveInitialAssistant(assistants) : ''
  )

  const handleSubmit = () => {
    if (!prompt.trim()) return
    if (assistants?.length && assistantId) {
      localStorage.setItem(STORAGE_KEY, assistantId)
    }
    onSubmit(prompt.trim(), attachment, assistants?.length ? assistantId : undefined)
  }

  const canSubmit = !!prompt.trim() && (!assistants?.length || !!assistantId)

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
              {assistants?.length && (
                <>
                  <Select value={assistantId} onValueChange={setAssistantId}>
                    <SelectTrigger className="h-auto w-auto shrink-0 border-0 bg-transparent p-0 text-body2 text-muted-foreground shadow-none focus:ring-0 focus:ring-offset-0 [&>svg]:ml-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {assistants.map((a) => (
                        <SelectItem key={a.id} value={a.id}>
                          {a.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className="h-4 w-px bg-border" />
                </>
              )}
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
              <Button variant="primary" size="icon" onClick={handleSubmit} disabled={!canSubmit}>
                <IconSend2 size={16} />
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
