import { useContext } from 'react'
import { useEnvironment } from '@/app/context/environmentProvider'
import ChatPageContext from './context'

export const useHardMessageLimitReached = (): boolean => {
  const { hardMessageLimit } = useEnvironment()
  const { state } = useContext(ChatPageContext)
  if (hardMessageLimit === undefined) return false
  const userMessageCount =
    state.selectedConversation?.messages.filter((m) => m.role === 'user').length ?? 0
  return userMessageCount >= hardMessageLimit
}
