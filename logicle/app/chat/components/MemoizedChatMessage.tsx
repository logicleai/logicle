import { FC, memo } from 'react'
import { ChatMessage, ChatMessageProps } from './ChatMessage'

export const MemoizedChatMessage: FC<ChatMessageProps> = memo(
  ChatMessage,
  (prevProps, nextProps) => prevProps.message.content === nextProps.message.content
)
