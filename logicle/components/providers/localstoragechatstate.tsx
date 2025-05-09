import { useState } from 'react'
import { useUserProfile } from './userProfileContext'

interface ChatState {
  version: number
  input: string
}

type ChatsState = Record<string, ChatState>

const parseChatsState = (key: string): ChatsState => {
  const data = localStorage.getItem(key)
  try {
    if (data) {
      return JSON.parse(data)
    }
  } catch {
    console.log('Failed parsing cache storage')
  }
  return {}
}

export const useChatInput = (id: string): [string, (input: string) => void] => {
  const profile = useUserProfile()
  const key = `chats/${profile?.id || ''}`
  const [userChatsState, setUserChatState] = useState<ChatsState>(() => parseChatsState(key))
  const chatInput = userChatsState[id]?.input || ''
  const setChatInput = (input: string) => {
    // reparse, just in case... other contexts have updated localstorage
    const chats = parseChatsState(key)
    chats[id] = {
      ...chats[id],
      input,
    }
    localStorage.setItem(key, JSON.stringify(chats))
    setUserChatState(chats)
  }
  return [chatInput, setChatInput]
}
