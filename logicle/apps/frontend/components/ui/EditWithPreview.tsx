import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Markdown } from '@/app/chat/components/Markdown'
import { useTranslation } from 'react-i18next'

type TabId = 'edit' | 'preview'

type EditWithPreviewProps = {
  value: string
  onChange: (v: string) => void
  onCancel?: () => void
  height?: number
  className?: string
  buttons?: React.ReactNode
}

export type EditWithPreviewHandle = {
  focus: () => void
}

export const EditWithPreview = forwardRef<EditWithPreviewHandle, EditWithPreviewProps>(
  function EditWithPreview({ value, onChange, onCancel, height, className, buttons }, ref) {
    const { t } = useTranslation()
    const [tab, setTab] = useState<TabId>('edit')
    const textareaRef = useRef<HTMLTextAreaElement | null>(null)

    // Ensure we're in "edit" mode, then focus the textarea.
    const focus = () => {
      if (tab !== 'edit') {
        setTab('edit')
        queueMicrotask(() => {
          requestAnimationFrame(() => textareaRef.current?.focus())
        })
      } else {
        textareaRef.current?.focus()
      }
    }

    useImperativeHandle(ref, () => ({ focus }), [tab])
    const Buttons = buttons
    return (
      <div
        className={className}
        onKeyDown={(evt) => {
          if (evt.code === 'Escape') onCancel?.()
        }}
        onFocus={(e) => {
          if (e.currentTarget === e.target) {
            focus()
          }
        }}
      >
        <div className="flex justify-between">
          <Tabs value={tab} onValueChange={(v) => setTab(v as TabId)}>
            <TabsList>
              <TabsTrigger value="edit">{t('edit')}</TabsTrigger>
              <TabsTrigger value="preview">{t('preview')}</TabsTrigger>
            </TabsList>
          </Tabs>
          {Buttons}
        </div>

        {tab === 'edit' ? (
          <textarea
            ref={textareaRef}
            style={{ height }}
            className="w-full border p-3 rounded-md"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(evt) => {
              if (evt.code === 'Escape') onCancel?.()
            }}
          />
        ) : (
          <ScrollArea style={{ height }} className="border p-3 rounded-md">
            <Markdown className="prose">{value}</Markdown>
          </ScrollArea>
        )}
      </div>
    )
  }
)
