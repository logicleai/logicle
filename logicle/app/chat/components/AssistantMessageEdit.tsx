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

const tabs = ['edit', 'preview'] as const
type TabId = (typeof tabs)[number]

interface Props {
  message: dto.BaseMessage
  onClose: () => void
  height?: number
}
export const AssistantMessageEdit = ({ onClose, message, height }: Props) => {
  const { t } = useTranslation()
  const [text, setText] = useState<string>(computeMarkdown(message))
  const [activeTab, setActiveTab] = useState<TabId>('edit')

  const {
    state: { selectedConversation, newChatAssistantId },
    setSelectedConversation,
  } = useContext(ChatPageContext)

  const handleSave = async () => {
    if (!selectedConversation) {
      return
    }
    await put(`/api/conversations/${message.conversationId}/messages/${message.id}`, {
      ...message,
      content: text,
    })
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
        <div>
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
