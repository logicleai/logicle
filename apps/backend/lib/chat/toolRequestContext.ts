import type * as dto from '@/types/dto'
import type { ToolRequestContext } from '@/lib/chat/tools'

/** Capture the latest real user turn, including when resuming after a confirmation. */
export const captureToolRequestContext = (
  messages: dto.Message[],
  userId: string,
  conversationId?: string
): ToolRequestContext => {
  const messageId = [...messages].reverse().find((message) => message.role === 'user')?.id
  return {
    ...(conversationId ? { conversationId } : {}),
    ...(messageId ? { messageId } : {}),
    ...(userId ? { userId } : {}),
  }
}
