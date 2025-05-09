import { useState } from 'react'

interface ChatState {
  version: number
  input: string
}

type ChatsState = Record<string, ChatState>

export const useChatInput = (id: string): [string, (input: string) => void] => {
  const [chatState, setChatState] = useState<ChatsState>(() => {
    return JSON.parse(localStorage.getItem(`chats`) || '{}')
  })
  const chatInput = chatState[id]?.input || ''
  const setChatInput = (input: string) => {
    // reparse, just in case... other contexts have updated localstorage
    const chats = JSON.parse(localStorage.getItem(`chats`) || '{}')
    chats[id] = {
      ...chats[id],
      input,
    }
    localStorage.setItem('chats', JSON.stringify(chats))
    setChatState(chats)
  }
  return [chatInput, setChatInput]
}
