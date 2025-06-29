import { Button } from '@/components/ui/button'
import { TextareaHTMLAttributes, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { string } from 'zod/v4'

interface Props {
  initialText: string
  onClose: () => void
  height?: number
}
export const AssistantMessageEdit = ({ onClose, initialText, height }: Props) => {
  const { t } = useTranslation()
  const [text, setText] = useState<string>(initialText)
  const handleSave = () => {}

  return (
    <>
      <textarea style={{ height }} onChange={(evt) => setText(evt.target.value)}>
        {text}
      </textarea>
      <div className="mt-4 flex justify-center gap-4">
        <Button variant="primary" onClick={handleSave}>
          {t('save_and_submit')}
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            onClose()
          }}
        >
          {t('cancel')}
        </Button>
      </div>
    </>
  )
}
