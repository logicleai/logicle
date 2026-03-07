'use client'

import type { MutableRefObject } from 'react'
import { ChatApiKeyPanel } from './ChatApiKeyPanel'
import { ChatInput } from './ChatInput'
import * as dto from '@/types/dto'

interface Props {
  assistant: dto.AssistantIdentification & {
    usability: dto.AssistantUsability
  }
  chatInput: string
  setChatInput: (chatInput: string) => void
  supportedMedia: string[]
  conversationId?: string
  targetMessageId?: string
  contextLength?: number
  tokenLimit?: number
  contextLengthCacheId?: string
  onSend: (params: { content: string; attachments: dto.Attachment[] }) => void
  textAreaRef?: MutableRefObject<HTMLTextAreaElement | null>
}

export const ChatInputOrApiKey = ({
  assistant,
  chatInput,
  setChatInput,
  supportedMedia,
  conversationId,
  targetMessageId,
  contextLength,
  tokenLimit,
  contextLengthCacheId,
  onSend,
  textAreaRef,
}: Props) => {
  if (assistant.usability.state === 'need-api-key') {
    return (
      <ChatApiKeyPanel
        backendId={assistant.usability.backendId}
        backendName={assistant.usability.backendName}
        assistantId={assistant.id}
      />
    )
  }
  return (
    <ChatInput
      chatInput={chatInput}
      setChatInput={setChatInput}
      supportedMedia={supportedMedia}
      assistantId={assistant.id}
      conversationId={conversationId}
      targetMessageId={targetMessageId}
      contextLength={contextLength}
      tokenLimit={tokenLimit}
      contextLengthCacheId={contextLengthCacheId}
      onSend={onSend}
      textAreaRef={textAreaRef}
    />
  )
}
