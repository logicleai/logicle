import { useContext } from 'react'
import { useEnvironment } from '@/app/context/environmentProvider'
import ChatPageContext from './context'
import { flatten } from '@/lib/chat/conversationUtils'

export const useHardMessageLimitReached = (): boolean => {
  const { hardMessageLimit } = useEnvironment()
  const { state } = useContext(ChatPageContext)
  if (hardMessageLimit === undefined) return false
  const conversation = state.selectedConversation
  if (!conversation) return false
  const currentBranch = flatten(conversation.messages, conversation.targetLeaf)
  const userMessageCount = currentBranch.filter((m) => m.role === 'user').length
  return userMessageCount >= hardMessageLimit
}
