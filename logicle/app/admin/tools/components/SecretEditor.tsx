'use client'

import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { PasswordInput } from '@/components/ui/password-input'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type SecretEditorProps = {
  value?: string | null
  onChange: (nextValue: string) => void
  label?: string
  placeholder?: string
  disabled?: boolean
}

const SECRET_REF = /^\$\{secret[.:][a-zA-Z0-9_-]+\}$/
const REF = /^\$\{[a-zA-Z0-9_-]+\}$/

const getDisplayState = (
  value: string | null | undefined,
  t: (key: string) => string,
  fallbackPlaceholder?: string
) => {
  if (typeof value === 'string' && SECRET_REF.test(value)) {
    return { value: '', placeholder: t('secret_editor_stored_secret') }
  }
  if (typeof value === 'string' && REF.test(value)) {
    return { value: '', placeholder: t('secret_editor_from_env') }
  }
  if (typeof value === 'string' && value.length > 0) {
    return { value: '********', placeholder: undefined }
  }
  return { value: '', placeholder: fallbackPlaceholder }
}

export const SecretEditor = ({
  value,
  onChange,
  label,
  placeholder,
  disabled,
}: SecretEditorProps) => {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [nextValue, setNextValue] = useState('')
  const displayState = getDisplayState(value, t, placeholder)

  const handleOpenChange = (nextOpen: boolean) => {
    if (disabled && nextOpen) return
    setOpen(nextOpen)
    if (nextOpen) {
      setNextValue('')
    }
  }

  const handleSave = () => {
    onChange(nextValue)
    setOpen(false)
  }

  return (
    <div className="flex flex-col gap-1">
      {label && <p>{label}</p>}
      <Input
        readOnly
        value={displayState.value}
        placeholder={displayState.placeholder}
        className={disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
        onClick={() => handleOpenChange(true)}
        disabled={disabled}
      />
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-[50%]" onInteractOutside={(e) => e.preventDefault()}>
          <DialogHeader>
            <DialogTitle>{t('secret_editor_set_secret')}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <PasswordInput
              autoComplete="new-password"
              placeholder={t('secret_editor_new_value')}
              value={nextValue}
              onChange={(evt) => setNextValue(evt.currentTarget.value)}
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>
                {t('secret_editor_cancel')}
              </Button>
              <Button onClick={handleSave} disabled={nextValue.length === 0}>
                {t('secret_editor_save')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
