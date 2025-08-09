import React, { useEffect, useRef, useState } from 'react'
import { IconEye, IconEyeOff, IconPencil } from '@tabler/icons-react'
import { Button } from './button'
import { useTranslation } from 'react-i18next'
import { Input } from './input'

type InputPasswordProps = {
  onChange: (value: string) => void
  modalTitle: string
  placeholder?: string
  label?: string
  disabled?: boolean
}

export default function InputPassword({
  onChange,
  modalTitle,
  placeholder = '••••••••',
  label,
  disabled = false,
}: InputPasswordProps) {
  const { t } = useTranslation()
  const [modalOpen, setModalOpen] = useState<boolean>(false)
  const [value, setValue] = useState<string>('')
  const [show, setShow] = useState<boolean>(false)
  const [error, setError] = useState<string>('')

  const dialogRef = useRef<HTMLDivElement | null>(null)
  const firstInputRef = useRef<HTMLInputElement | null>(null)

  // Focus sul primo input quando si apre la modale
  useEffect(() => {
    if (modalOpen) {
      const id = requestAnimationFrame(() => firstInputRef.current?.focus())
      return () => cancelAnimationFrame(id)
    }
  }, [modalOpen])

  // Chiudi la modale con ESC e click fuori
  useEffect(() => {
    if (!modalOpen) return

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModalOpen(false)
    }
    const onClickOutside = (e: MouseEvent) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target as Node)) {
        setModalOpen(false)
      }
    }

    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClickOutside)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClickOutside)
    }
  }, [modalOpen])

  const resetModalState = () => {
    setValue('')
    setError('')
    setShow(false)
  }

  const handleOpen = () => {
    if (disabled) return
    resetModalState()
    setModalOpen(true)
  }

  const handleSave = () => {
    onChange(value)
    resetModalState()
    setModalOpen(false)
  }

  return (
    <>
      {label && <label className="block mb-1 text-sm font-medium text-gray-700">{label}</label>}

      <div className="flex items-stretch border rounded-lg overflow-hidden">
        <input
          type="password"
          value={placeholder}
          readOnly
          className="flex-1 px-3 py-2 bg-gray-50 text-gray-500 cursor-not-allowed"
          autoComplete="off"
          tabIndex={-1}
        />
        <Button
          variant="primary"
          type="button"
          onClick={handleOpen}
          disabled={disabled}
          className="px-3 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <IconPencil size={18} />
        </Button>
      </div>

      {/* Modale */}
      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
        >
          <div ref={dialogRef} className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg">
            <h2 className="text-lg font-semibold mb-4">{modalTitle}</h2>

            <div className="mb-3">
              <div className="relative">
                <Input
                  ref={firstInputRef}
                  type={show ? 'text' : 'password'}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={placeholder}
                  className="w-full border rounded-lg px-3 py-2 pr-10"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-500"
                >
                  {show ? <IconEyeOff size={20} /> : <IconEye size={20} />}
                </button>
              </div>
            </div>

            {error && (
              <p className="text-red-600 text-sm mb-3" role="alert">
                {error}
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  resetModalState()
                  setModalOpen(false)
                }}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
              >
                {t('ok')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
