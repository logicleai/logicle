'use client'
import ChatPageContext, { SendMessageParams, SideBarContent } from '@/app/chat/components/context'
import { ChatPageState, defaultChatPageState } from '@/app/chat/components/state'
import { useCreateReducer } from '@/hooks/useCreateReducer'
import { FC, ReactNode, useCallback, useEffect, useRef } from 'react'
import { ChatStatus } from './ChatStatus'
import { nanoid } from 'nanoid'
import * as dto from '@/types/dto'
import { useTranslation } from 'react-i18next'
import { ConversationWithMessages } from '@/lib/chat/types'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { applyStreamPartToMessages } from '@/lib/chat/streamApply'
import { getActiveChatRun, startChatRun, subscribeToChatRun } from '@/services/chat'
import { mutate } from 'swr'

interface Props {
  children: ReactNode
}

export const ChatPageContextProvider: FC<Props> = ({ children }) => {
  const userProfile = useUserProfile()
  const contextValue = useCreateReducer<ChatPageState>({
    initialState: {
      ...defaultChatPageState,
      newChatAssistantId: userProfile?.lastUsedAssistant?.id ?? null,
    },
  })

  const {
    state: { selectedConversation },
    dispatch,
  } = contextValue

  const selectedConversationRef = useRef<ConversationWithMessages | undefined>()
  const conversationSnapshotsRef = useRef<Map<string, ConversationWithMessages>>(new Map())
  const subscriptionRef = useRef<
    | {
        conversationId: string
        runId: string
        abortController: AbortController
      }
    | undefined
  >()
  const subscriptionNonceRef = useRef(0)
  const { t, i18n } = useTranslation()

  const mergeConversationSnapshot = useCallback(
    (
      nextConversation: ConversationWithMessages,
      mode: 'preserve-local' | 'replace' = 'preserve-local'
    ): ConversationWithMessages => {
      const cachedConversation = conversationSnapshotsRef.current.get(nextConversation.id)
      if (!cachedConversation) {
        return nextConversation
      }
      if (mode === 'replace') {
        return {
          ...nextConversation,
          targetLeaf: cachedConversation.targetLeaf,
        }
      }

      const serverMessages = nextConversation.messages
      const cachedMessages = cachedConversation.messages
      const canReuseCachedMessages =
        cachedMessages.length >= serverMessages.length &&
        serverMessages.every((message, index) => cachedMessages[index]?.id === message.id)

      return {
        ...nextConversation,
        messages: canReuseCachedMessages ? cachedMessages : serverMessages,
        targetLeaf: cachedConversation.targetLeaf,
      }
    },
    []
  )

  const setSelectedConversationState = useCallback(
    (conversation: ConversationWithMessages | undefined) => {
      if (conversation) {
        conversationSnapshotsRef.current.set(conversation.id, conversation)
      }
      selectedConversationRef.current = conversation
      dispatch({ field: 'selectedConversation', value: conversation })
    },
    [dispatch]
  )

  const setChatStatusState = useCallback(
    (chatStatus: ChatStatus) => {
      dispatch({ field: 'chatStatus', value: chatStatus })
    },
    [dispatch]
  )

  const disconnectSubscription = useCallback((conversationId?: string) => {
    const current = subscriptionRef.current
    if (!current) return
    if (conversationId && current.conversationId !== conversationId) return
    current.abortController.abort()
    subscriptionRef.current = undefined
  }, [])

  const waitForReconnect = useCallback((ms: number, signal: AbortSignal) => {
    return new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        signal.removeEventListener('abort', onAbort)
        resolve()
      }, ms)

      const onAbort = () => {
        window.clearTimeout(timeout)
        reject(new DOMException('Aborted', 'AbortError'))
      }

      signal.addEventListener('abort', onAbort, { once: true })
    })
  }, [])

  const subscribeRun = useCallback(
    async ({
      conversationId,
      runId,
      attempt = 0,
    }: {
      conversationId: string
      runId: string
      attempt?: number
    }) => {
      const existing = subscriptionRef.current
      if (existing?.conversationId === conversationId && existing.runId === runId) {
        return
      }

      disconnectSubscription()
      const abortController = new AbortController()
      subscriptionRef.current = { conversationId, runId, abortController }
      const nonce = ++subscriptionNonceRef.current
      setChatStatusState({ state: 'receiving', runId, abortController })

      try {
        await subscribeToChatRun({
          runId,
          signal: abortController.signal,
          onEvent(event) {
            if (subscriptionNonceRef.current !== nonce) return
            const currentConversation = selectedConversationRef.current
            if (!currentConversation || currentConversation.id !== conversationId) return
            if (event.type === 'summary') {
              void mutate('/api/conversations')
              setSelectedConversationState({
                ...currentConversation,
                name: event.summary,
              })
              return
            }

            const updatedConversation = {
              ...currentConversation,
              messages: applyStreamPartToMessages(currentConversation.messages, event),
            }
            setSelectedConversationState(updatedConversation)

            if (event.type === 'message') {
              setChatStatusState({
                state: 'receiving',
                runId,
                messageId: event.msg.id,
                abortController,
              })
            }
          },
          onClose() {
            if (subscriptionNonceRef.current !== nonce) return
            if (
              subscriptionRef.current?.conversationId === conversationId &&
              subscriptionRef.current?.runId === runId
            ) {
              subscriptionRef.current = undefined
            }
            void (async () => {
              const activeRunResponse = await getActiveChatRun(conversationId)
              const activeRun = activeRunResponse.data?.run
              if (subscriptionNonceRef.current !== nonce || abortController.signal.aborted) {
                return
              }
              if (activeRun?.id === runId) {
                await waitForReconnect(Math.min(250 * (attempt + 1), 1000), abortController.signal)
                if (subscriptionNonceRef.current !== nonce || abortController.signal.aborted) {
                  return
                }
                await subscribeRun({
                  conversationId,
                  runId,
                  attempt: attempt + 1,
                })
                return
              }
              setChatStatusState({ state: 'idle' })
              void mutate('/api/conversations')
            })().catch((error) => {
              if (abortController.signal.aborted || subscriptionNonceRef.current !== nonce) {
                return
              }
              console.error(error)
              setChatStatusState({ state: 'idle' })
            })
          },
        })
      } catch (error) {
        if (abortController.signal.aborted || subscriptionNonceRef.current !== nonce) {
          return
        }
        const activeRunResponse = await getActiveChatRun(conversationId)
        const activeRun = activeRunResponse.data?.run
        if (activeRun?.id === runId) {
          await waitForReconnect(Math.min(250 * (attempt + 1), 1000), abortController.signal)
          if (abortController.signal.aborted || subscriptionNonceRef.current !== nonce) {
            return
          }
          await subscribeRun({
            conversationId,
            runId,
            attempt: attempt + 1,
          })
          return
        }
        const currentConversation = selectedConversationRef.current
        if (currentConversation?.id === conversationId && currentConversation.messages.length > 0) {
          const lastIndex = currentConversation.messages.length - 1
          setSelectedConversationState({
            ...currentConversation,
            messages: [
              ...currentConversation.messages.slice(0, lastIndex),
              {
                ...currentConversation.messages[lastIndex],
                error: t('chat_response_failure'),
              },
            ],
          })
        }
        subscriptionRef.current = undefined
        setChatStatusState({ state: 'idle' })
        console.error(error)
      }
    },
    [
      disconnectSubscription,
      setChatStatusState,
      setSelectedConversationState,
      t,
      waitForReconnect,
    ]
  )

  const setNewChatAssistantId = useCallback(
    (assistantId: string | null) => {
      dispatch({ field: 'newChatAssistantId', value: assistantId })
    },
    [dispatch]
  )

  const setChatInputElement = useCallback(
    (element: HTMLTextAreaElement | null) => {
      dispatch({ field: 'chatInputElement', value: element })
    },
    [dispatch]
  )

  const setSideBarContent = useCallback(
    (content?: SideBarContent) => {
      dispatch({ field: 'sideBarContent', value: content })
    },
    [dispatch]
  )

  const setSelectedConversation = useCallback(
    (conversation: ConversationWithMessages | undefined) => {
      if (selectedConversationRef.current?.id !== conversation?.id) {
        disconnectSubscription()
      }
      setSelectedConversationState(
        conversation ? mergeConversationSnapshot(conversation, 'replace') : undefined
      )
      setChatStatusState({ state: 'idle' })
    },
    [disconnectSubscription, mergeConversationSnapshot, setChatStatusState, setSelectedConversationState]
  )

  const getConversationSnapshot = useCallback((conversationId: string) => {
    return conversationSnapshotsRef.current.get(conversationId)
  }, [])

  const createDtoMessage = (
    msg: SendMessageParams['msg'],
    conversationId: string,
    parent: string | null
  ): dto.Message => {
    if (msg.role === 'user') {
      return {
        ...msg,
        attachments: msg.attachments || [],
        id: nanoid(),
        conversationId,
        role: msg.role,
        parent,
        sentAt: new Date().toISOString(),
      }
    }
    return {
      ...msg,
      id: nanoid(),
      conversationId,
      role: msg.role,
      parent,
      sentAt: new Date().toISOString(),
    }
  }

  const sendMessage = async ({ msg, repeating, conversation }: SendMessageParams) => {
    setSideBarContent(undefined)
    let parent: string | null = null
    conversation = conversation ?? selectedConversationRef.current
    if (!conversation) {
      return
    } else if (repeating) {
      parent = repeating.parent
    } else if (conversation.targetLeaf) {
      parent = conversation.targetLeaf
    } else {
      for (const message of conversation.messages.slice().reverse()) {
        if (message.role !== 'user') {
          parent = message.id
          break
        }
      }
    }

    conversation.targetLeaf = undefined
    const userMessage = createDtoMessage(msg, conversation.id, parent)
    const optimisticConversation = {
      ...conversation,
      messages: applyStreamPartToMessages(conversation.messages, {
        type: 'message',
        msg: userMessage,
      }),
    }

    setSelectedConversationState(optimisticConversation)
    setChatStatusState({ state: 'sending', messageId: userMessage.id })

    const response = await startChatRun(userMessage)
    if (response.error) {
      const latestConversation = selectedConversationRef.current
      if (latestConversation?.id === conversation.id) {
        const lastIndex = latestConversation.messages.length - 1
        setSelectedConversationState({
          ...latestConversation,
          messages: [
            ...latestConversation.messages.slice(0, lastIndex),
            {
              ...latestConversation.messages[lastIndex],
              error: t(response.error.message || 'chat_response_failure'),
            },
          ],
        })
      }
      setChatStatusState({ state: 'idle' })
      return
    }

    await subscribeRun({
      conversationId: conversation.id,
      runId: response.data.id,
    })
  }

  useEffect(() => {
    const conversationId = selectedConversation?.id
    if (!conversationId) {
      disconnectSubscription()
      setChatStatusState({ state: 'idle' })
      return
    }

    const activeSubscription = subscriptionRef.current
    if (activeSubscription?.conversationId === conversationId) {
      return
    }

    let canceled = false
    void (async () => {
      const response = await getActiveChatRun(conversationId)
      if (canceled) return
      const run = response.data?.run
      if (!run) {
        setChatStatusState({ state: 'idle' })
        return
      }
      await subscribeRun({
        conversationId,
        runId: run.id,
      })
    })()

    return () => {
      canceled = true
    }
  }, [disconnectSubscription, selectedConversation?.id, setChatStatusState, subscribeRun])

  useEffect(() => {
    selectedConversationRef.current = selectedConversation
  }, [selectedConversation])

  useEffect(() => {
    return () => {
      disconnectSubscription()
    }
  }, [disconnectSubscription])

    return (
    <ChatPageContext.Provider
      value={{
        ...contextValue,
        setSelectedConversation,
        getConversationSnapshot,
        setNewChatAssistantId,
        sendMessage,
        setChatInputElement,
        setSideBarContent,
      }}
    >
      {children}
    </ChatPageContext.Provider>
  )
}
