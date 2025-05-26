import { Button } from '@/components/ui/button'
import { IconChevronLeft, IconChevronRight } from '@tabler/icons-react'
import { useContext } from 'react'
import ChatPageContext from './context'
import { MessageWithError } from '@/lib/chat/types'

const findYoungestChildOf = (messages: MessageWithError[], messageId: string) => {
  const children = messages.filter((m) => m.parent == messageId)
  if (children.length == 0) {
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
  if (siblings.length == 1) return <></>
  const pos = siblings.findIndex((s) => s == id)
  if (pos < 0) {
    return <></>
  }
  const isFirst = pos == 0
  const isLast = pos + 1 == siblings.length
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
      <button disabled={isFirst} onClick={() => jumpTo(pos - 1)}>
        <IconChevronLeft size={20}></IconChevronLeft>
      </button>
      <span className="text-sm">{`${pos + 1}/${siblings.length}`}</span>
      <button disabled={isLast} onClick={() => jumpTo(pos + 1)}>
        <IconChevronRight size={20}></IconChevronRight>
      </button>
    </div>
  )
}
