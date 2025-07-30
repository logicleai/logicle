import { Button } from '@/components/ui/button'
import { useContext, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AssistantMessageMarkdown } from './AssistantMessageMarkdown'
import { ScrollArea } from '@/components/ui/scroll-area'
import { put } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { computeMarkdown } from './markdown/process'
import ChatPageContext from './context'
import { AssistantMessageEx } from '@/lib/chat/types'

const tabs = ['edit', 'preview'] as const
type TabId = (typeof tabs)[number]

interface Props {
  message: AssistantMessageEx
  part: dto.TextPart
  onClose: () => void
  height?: number
}

export const AssistantMessageEdit = ({ onClose, message, part, height }: Props) => {
  const { t } = useTranslation()
  const [text, setText] = useState<string>(computeMarkdown(part.text))
  const [activeTab, setActiveTab] = useState<TabId>('edit')

  const {
    state: { selectedConversation },
    setSelectedConversation,
  } = useContext(ChatPageContext)

  const handleSave = async () => {
    if (!selectedConversation) {
      return
    }
    const partIndex = message.parts.indexOf(part)
    const patchedParts = [...message.parts]
    patchedParts[partIndex] = {
      type: 'text',
      text: text,
    }
    const patchedMsg = {
      ...message,
      parts: patchedParts,
    }
    await put(`/api/conversations/${message.conversationId}/messages/${message.id}`, patchedMsg)
    setSelectedConversation({
      ...selectedConversation,
      messages: selectedConversation.messages.map((m) => {
        if (m.id != message.id) return m
        return {
          ...m,
          content: text,
        }
      }),
    })
    onClose()
  }

  return (
    <>
      <div className="flex flex-horz justify-between">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabId)}>
          <TabsList>
            {tabs.map((menu) => {
              return (
                <TabsTrigger role="tab" key={menu} value={menu}>
                  {t(menu)}
                </TabsTrigger>
              )
            })}
          </TabsList>
        </Tabs>
        <div className="flex flex-horz gap-2">
          <Button variant="primary" size="small" onClick={handleSave}>
            {t('save_and_submit')}
          </Button>
          <Button variant="secondary" size="small" onClick={onClose}>
            {t('cancel')}
          </Button>
        </div>
      </div>
      {activeTab == 'edit' && (
        <textarea
          style={{ height }}
          onChange={(evt) => setText(evt.target.value)}
          value={text}
        ></textarea>
      )}

      {activeTab == 'preview' && (
        <ScrollArea style={{ height }} className="border p-3">
          <AssistantMessageMarkdown className="prose">{text}</AssistantMessageMarkdown>
        </ScrollArea>
      )}
    </>
  )
}
