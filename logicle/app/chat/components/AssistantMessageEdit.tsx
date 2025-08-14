import { Button } from '@/components/ui/button'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { AssistantMessageMarkdown } from './AssistantMessageMarkdown'
import { ScrollArea } from '@/components/ui/scroll-area'
import { put } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { computeMarkdown } from './markdown/process'
import ChatPageContext from './context'
import { AssistantMessageEx } from '@/lib/chat/types'
import { useAssistantEditState, pruneAssistantEditState } from '@/hooks/assistantEditPersistence'
import { useUserProfile } from '@/components/providers/userProfileContext'

const tabs = ['edit', 'preview'] as const
type TabId = (typeof tabs)[number]

interface Props {
  message: AssistantMessageEx
  part: dto.TextPart
  onClose: () => void
  height?: number
}

const PRUNE_MAX_ENTRIES = 100
const PRUNE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000 // 14 days

export const AssistantMessageEdit = ({ onClose, message, part, height }: Props) => {
  const { t } = useTranslation()
  const profile = useUserProfile()

  const {
    state: { selectedConversation },
    setSelectedConversation,
  } = useContext(ChatPageContext)

  // Identify which part we're editing
  const partIndex = useMemo(() => message.parts.indexOf(part), [message.parts, part])

  // Prune persisted drafts once when the editor opens (per user)
  const prunedOnceRef = useRef(false)
  useEffect(() => {
    if (prunedOnceRef.current) return
    prunedOnceRef.current = true
    pruneAssistantEditState(profile?.id, {
      maxEntries: PRUNE_MAX_ENTRIES,
      maxAgeMs: PRUNE_MAX_AGE_MS,
    })
  }, [profile?.id])

  // Persist/hydrate the draft text via the shared hook (per-user container)
  const { text, setText, clear } = useAssistantEditState({
    userId: profile?.id,
    messageId: message.id,
    partIndex,
    initialText: computeMarkdown(part.text),
  })

  const [activeTab, setActiveTab] = useState<TabId>('edit')

  const handleSave = async () => {
    if (!selectedConversation) return

    const patchedParts = [...message.parts]
    patchedParts[partIndex] = { type: 'text', text }

    const patchedMsg: AssistantMessageEx = { ...message, parts: patchedParts }

    await put(`/api/conversations/${message.conversationId}/messages/${message.id}`, patchedMsg)

    setSelectedConversation({
      ...selectedConversation,
      messages: selectedConversation.messages.map((m) => (m.id !== message.id ? m : patchedMsg)),
    })

    // Remove this draft from local storage only after a successful save
    clear()
    onClose()
  }

  return (
    <>
      <div className="flex flex-horz justify-between">
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TabId)}>
          <TabsList>
            {tabs.map((menu) => (
              <TabsTrigger role="tab" key={menu} value={menu}>
                {t(menu)}
              </TabsTrigger>
            ))}
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

      {activeTab === 'edit' && (
        <textarea style={{ height }} onChange={(evt) => setText(evt.target.value)} value={text} />
      )}

      {activeTab === 'preview' && (
        <ScrollArea style={{ height }} className="border p-3">
          <AssistantMessageMarkdown className="prose">{text}</AssistantMessageMarkdown>
        </ScrollArea>
      )}
    </>
  )
}
