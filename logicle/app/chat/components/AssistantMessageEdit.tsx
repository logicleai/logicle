import { Button } from '@/components/ui/button'
import { useContext, useEffect, useMemo, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { Markdown } from './Markdown'
import { put } from '@/lib/fetch'
import * as dto from '@/types/dto'
import { computeMarkdown } from './markdown/process'
import ChatPageContext from './context'
import { AssistantMessageEx } from '@/lib/chat/types'
import { useAssistantEditState, pruneAssistantEditState } from '@/hooks/assistantEditPersistence'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { EditWithPreview } from '@/components/ui/EditWithPreview'
import { MessageEdit } from './MessageEdit'

interface Props {
  message: AssistantMessageEx
  part: dto.TextPart
  onClose: () => void
  height?: number
}

const PRUNE_MAX_ENTRIES = 100
const PRUNE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000

export const AssistantMessageEdit = ({ onClose, message, part, height }: Props) => {
  const { t } = useTranslation()
  const profile = useUserProfile()

  const {
    state: { selectedConversation },
    setSelectedConversation,
  } = useContext(ChatPageContext)

  const partIndex = useMemo(() => message.parts.indexOf(part), [message.parts, part])

  const prunedOnceRef = useRef(false)
  useEffect(() => {
    if (prunedOnceRef.current) return
    prunedOnceRef.current = true
    pruneAssistantEditState(profile?.id, {
      maxEntries: PRUNE_MAX_ENTRIES,
      maxAgeMs: PRUNE_MAX_AGE_MS,
    })
  }, [profile?.id])

  const { text, setText, clear } = useAssistantEditState({
    userId: profile?.id,
    messageId: message.id,
    partIndex,
    initialText: computeMarkdown(part.text),
  })

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

    clear()
    onClose()
  }

  return (
    <>
      <div className="flex flex-horz justify-between mb-2">
        <div />
        <div className="flex gap-2">
          <Button variant="primary" size="small" onClick={handleSave}>
            {t('save')}
          </Button>
          <Button variant="secondary" size="small" onClick={onClose}>
            {t('cancel')}
          </Button>
        </div>
      </div>
      <MessageEdit value={text} onChange={setText} height={height} />
    </>
  )
}
