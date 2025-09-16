import { useUserProfile } from '@/components/providers/userProfileContext'
import { EditWithPreview, EditWithPreviewHandle } from '@/components/ui/EditWithPreview'
import { userPreferencesDefaults } from '@/types/dto'
import { forwardRef, useImperativeHandle, useRef } from 'react'

export type MessageEditHandle = {
  focus: () => void
}

type Props = {
  value: string
  height?: number
  onChange: (v: string) => void
  onCancel?: () => void
  buttons?: React.ReactNode
}

export const MessageEdit = forwardRef<MessageEditHandle, Props>(function MessageEdit(
  { value, height, buttons, onChange, onCancel },
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
    return (
      <EditWithPreview
        height={height}
        ref={advancedRef}
        value={value}
        onChange={onChange}
        onCancel={onCancel}
        buttons={buttons}
      />
    )
  }

  return (
    <div>
      <div className="flex justify-end">{buttons}</div>
      <textarea
        ref={textareaRef}
        className="w-full resize-none whitespace-pre-wrap border-none bg-transparent prose"
        value={value}
        onChange={(evt) => onChange(evt.target.value)}
        onKeyDown={(evt) => {
          if (evt.code == 'Escape') onCancel?.()
        }}
        style={{
          padding: '0',
          margin: '0',
          overflow: 'hidden',
          height,
        }}
      />
    </div>
  )
})
