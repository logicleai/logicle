import { useCallback, useState } from 'react'
import { useUserProfile } from './userProfileContext'

interface ChatState {
  version: number
  input: string
}

interface ContextLengthState {
  version: number
  contextLength: number
}

type ChatsState = Record<string, ChatState>
type ContextLengthsState = Record<string, ContextLengthState>

const parseChatsState = (key: string): ChatsState => {
  if (typeof window === 'undefined') return {}
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
  const setChatInput = useCallback((input: string) => {
    if (typeof window === 'undefined') return
    // reparse, just in case... other contexts have updated localstorage
    const chats = parseChatsState(key)
    chats[id] = {
      ...chats[id],
      input,
    }
    localStorage.setItem(key, JSON.stringify(chats))
    setUserChatState(chats)
  }, [id, key])
  return [chatInput, setChatInput]
}

const parseContextLengthsState = (key: string): ContextLengthsState => {
  if (typeof window === 'undefined') return {}
  const data = localStorage.getItem(key)
  try {
    if (data) {
      return JSON.parse(data)
    }
  } catch {
    console.log('Failed parsing context length cache storage')
  }
  return {}
}

export const useCachedContextLength = (
  id: string
): [number | undefined, (contextLength: number) => void] => {
  const profile = useUserProfile()
  const key = `context-length/${profile?.id || ''}`
  const [userContextLengthsState, setUserContextLengthsState] = useState<ContextLengthsState>(() =>
    parseContextLengthsState(key)
  )
  const contextLength = userContextLengthsState[id]?.contextLength
  const setContextLength = useCallback((nextContextLength: number) => {
    if (typeof window === 'undefined') return
    const contextLengths = parseContextLengthsState(key)
    contextLengths[id] = {
      ...contextLengths[id],
      contextLength: nextContextLength,
      version: 1,
    }
    localStorage.setItem(key, JSON.stringify(contextLengths))
    setUserContextLengthsState(contextLengths)
  }, [id, key])
  return [contextLength, setContextLength]
}
