import { useUserProfile } from '@/components/providers/userProfileContext'
import { EditWithPreview, EditWithPreviewHandle } from '@/components/ui/EditWithPreview'
import { userPreferencesDefaults } from '@/types/dto'
import React, { forwardRef, useImperativeHandle, useRef } from 'react'

export type MessageEditHandle = {
  focus: () => void
}

type Props = {
  value: string
  onChange: (v: string) => void
  height?: number
}

export const MessageEdit = forwardRef<MessageEditHandle, Props>(function MessageEdit(
  { value, onChange, height },
  ref
) {
  const profile = useUserProfile()

  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const advancedRef = useRef<EditWithPreviewHandle | null>(null)

  useImperativeHandle(
    ref,
    () => ({
      focus() {
        if (advancedRef.current) {
          advancedRef.current.focus()
        } else {
          textareaRef.current?.focus()
        }
      },
    }),
    []
  )

  const isAdvanced =
    profile?.preferences.advancedMessageEditor ?? userPreferencesDefaults.advancedMessageEditor

  if (isAdvanced) {
    return <EditWithPreview ref={advancedRef} height={height} value={value} onChange={onChange} />
  }

  return (
    <textarea
      ref={textareaRef}
      className="w-full resize-none whitespace-pre-wrap border-none bg-transparent prose"
      value={value}
      onChange={(evt) => onChange(evt.target.value)}
      style={{
        padding: '0',
        margin: '0',
        overflow: 'hidden',
        ...(height !== undefined ? { height } : {}),
      }}
    />
  )
})
