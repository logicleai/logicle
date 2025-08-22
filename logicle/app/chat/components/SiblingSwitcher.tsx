import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { useContext } from 'react'
import ChatPageContext from './context'
import { MessageWithError } from '@/lib/chat/types'
import { useEnvironment } from '@/app/context/environmentProvider'

const findYoungestChildOf = (messages: MessageWithError[], messageId: string) => {
  const children = messages.filter((m) => m.parent === messageId)
  if (children.length === 0) {
    return undefined
  }
  const youngest = children.reduce((a, b) => (a.sentAt > b.sentAt ? a : b))
  return youngest.id
}

const findYoungestLeafChildOf = (messages: MessageWithError[], messageId: string) => {
  let next = findYoungestChildOf(messages, messageId)
  while (next) {
    messageId = next
    next = findYoungestChildOf(messages, messageId)
  }
  return messageId
}

export const SiblingSwitcher = ({
  id,
  siblings,
  className,
}: {
  id: string
  siblings: string[]
  className?: string
}) => {
  const { state, setSelectedConversation } = useContext(ChatPageContext)
  const environment = useEnvironment()
  if (!environment.enableChatTreeNavigation || siblings.length <= 1) return null
  const pos = siblings.indexOf(id)
  if (pos < 0) {
    return null
  }
  const isFirst = pos === 0
  const isLast = pos + 1 === siblings.length
  const jumpTo = (index: number) => {
    const selectedConversation = state.selectedConversation?.messages ?? []
    const leaf = findYoungestLeafChildOf(selectedConversation, siblings[index])
    if (state.selectedConversation) {
      setSelectedConversation({
        ...state.selectedConversation,
        targetLeaf: leaf,
      })
    }
  }
  return (
    <div className={`flex align-center ${className ?? ''}`}>
      <button
        type="button"
        title={'previous_message'}
        disabled={isFirst}
        onClick={() => jumpTo(pos - 1)}
      >
        <IconChevronLeft size={20}></IconChevronLeft>
      </button>
      <span className="text-sm">{`${pos + 1}/${siblings.length}`}</span>
      <button
        type="button"
        title={'next_message'}
        disabled={isLast}
        onClick={() => jumpTo(pos + 1)}
      >
        <IconChevronRight size={20}></IconChevronRight>
      </button>
    </div>
  )
}
