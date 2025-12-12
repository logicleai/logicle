import * as React from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useTranslation } from 'react-i18next'

type EditableMultilinePopupInputProps = {
  label?: string
  description?: string
  placeholder?: string
  value: string
  onChange: (next: string) => void
  rows?: number
  disabled?: boolean
}

export function EditableMultilinePopupInput({
  label = 'Text',
  description = 'Edit multiple lines, then Save to apply.',
  placeholder = 'Type…',
  value,
  onChange,
  rows = 8,
  disabled,
}: EditableMultilinePopupInputProps) {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(false)
  const [draft, setDraft] = React.useState(value)

  // Keep draft in sync when dialog opens
  React.useEffect(() => {
    if (open) setDraft(value)
  }, [open, value])

  function handleSave() {
    onChange(draft)
    setOpen(false)
  }

  function handleCancel() {
    setDraft(value)
    setOpen(false)
  }

  // Optional: keep single-line input and multiline value aligned.
  // Here we store the "true" value with newlines, but show a single-line view.
  const singleLineView = value.replace(/\n/g, ' ')

  return (
    <div className="w-full space-y-2">
      <div className="relative">
        {/* Editable single-line input with space for the expand button */}
        <Input
          value={singleLineView}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)} // single-line edits overwrite value
          className="pr-20"
        />

        <div className="absolute inset-y-0 right-0 flex items-center pr-1">
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button type="button" variant="secondary" disabled={disabled} className="h-8">
                ...
              </Button>
            </DialogTrigger>

            <DialogContent className="sm:max-w-[680px]">
              <DialogHeader>
                <DialogTitle>{label}</DialogTitle>
                <DialogDescription>{description}</DialogDescription>
              </DialogHeader>

              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={placeholder}
                rows={rows}
                className="resize-y"
                autoFocus
              />

              <DialogFooter className="gap-2 sm:gap-0">
                <Button type="button" variant="ghost" onClick={handleCancel}>
                  {t('cancel')}
                </Button>
                <Button type="button" onClick={handleSave}>
                  {t('ok')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  )
}
