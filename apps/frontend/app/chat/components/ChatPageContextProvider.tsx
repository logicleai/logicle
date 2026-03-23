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
import { getActiveChatRun, startChatRun, stopChatRun, subscribeToChatRun } from '@/services/chat'
import { getConversation, getConversationMessages } from '@/services/conversation'
import { mutate } from 'swr'
import { mergeConversationSnapshot } from './conversationSnapshots'
import {
  chatRunMachineToStatus,
  getResumeSequence,
  idleChatRunMachineState,
  isRunAttachedToConversation,
  transitionChatRunMachine,
  type ChatRunMachineState,
} from './chatRunMachine'

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
  const chatRunMachineRef = useRef<ChatRunMachineState>(idleChatRunMachineState)
  const subscriptionNonceRef = useRef(0)
  const loadConversationNonceRef = useRef(0)
  const { t } = useTranslation()

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

  const setChatRunMachineState = useCallback(
    (nextState: ChatRunMachineState) => {
      chatRunMachineRef.current = nextState
      setChatStatusState(chatRunMachineToStatus(nextState))
    },
    [setChatStatusState]
  )

  const disconnectSubscription = useCallback((conversationId?: string) => {
    const current = chatRunMachineRef.current
    if (current.state !== 'receiving' && current.state !== 'reconnecting') return
    if (conversationId && current.conversationId !== conversationId) return
    current.abortController.abort()
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
      if (
        chatRunMachineRef.current.state === 'receiving' &&
        isRunAttachedToConversation(chatRunMachineRef.current, conversationId, runId)
      ) {
        return
      }

      const afterSequence = getResumeSequence(chatRunMachineRef.current, conversationId, runId)

      disconnectSubscription()
      const abortController = new AbortController()
      const nonce = ++subscriptionNonceRef.current
      setChatRunMachineState(
        transitionChatRunMachine(chatRunMachineRef.current, {
          type: 'run-attached',
          conversationId,
          runId,
          abortController,
          afterSequence,
        })
      )

      try {
        await subscribeToChatRun({
          runId,
          afterSequence,
          signal: abortController.signal,
          onEvent(event, sequence) {
            if (subscriptionNonceRef.current !== nonce) return
            const currentConversation = selectedConversationRef.current
            if (!currentConversation || currentConversation.id !== conversationId) return
            setChatRunMachineState(
              transitionChatRunMachine(chatRunMachineRef.current, {
                type: 'event-applied',
                conversationId,
                runId,
                sequence,
                messageId: event.type === 'message' ? event.msg.id : undefined,
              })
            )
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
          },
          onClose() {
            if (subscriptionNonceRef.current !== nonce) return
            void (async () => {
              const activeRunResponse = await getActiveChatRun(conversationId)
              const activeRun = activeRunResponse.data?.run
              if (subscriptionNonceRef.current !== nonce || abortController.signal.aborted) {
                return
              }
              if (activeRun?.id === runId) {
                setChatRunMachineState(
                  transitionChatRunMachine(chatRunMachineRef.current, {
                    type: 'reconnect-scheduled',
                    conversationId,
                    runId,
                    attempt: attempt + 1,
                  })
                )
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
              setChatRunMachineState(
                transitionChatRunMachine(chatRunMachineRef.current, {
                  type: 'run-finished',
                  conversationId,
                  runId,
                })
              )
              void mutate('/api/conversations')
            })().catch((error) => {
              if (abortController.signal.aborted || subscriptionNonceRef.current !== nonce) {
                return
              }
              console.error(error)
              setChatRunMachineState(
                transitionChatRunMachine(chatRunMachineRef.current, {
                  type: 'run-finished',
                  conversationId,
                  runId,
                })
              )
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
        setChatRunMachineState(
          transitionChatRunMachine(chatRunMachineRef.current, {
            type: 'run-finished',
            conversationId,
            runId,
          })
        )
        console.error(error)
      }
    },
    [
      disconnectSubscription,
      setChatRunMachineState,
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
      const nextMachineState = transitionChatRunMachine(chatRunMachineRef.current, {
        type: 'select-conversation',
        conversationId: conversation?.id,
      })
      if (selectedConversationRef.current?.id !== conversation?.id) {
        disconnectSubscription()
      }
      setSelectedConversationState(
        conversation
          ? mergeConversationSnapshot({
              cachedConversation: conversationSnapshotsRef.current.get(conversation.id),
              nextConversation: conversation,
              preserveLocalMessages:
                nextMachineState.state === 'receiving' ||
                nextMachineState.state === 'reconnecting',
            })
          : undefined
      )
      setChatRunMachineState(nextMachineState)
    },
    [disconnectSubscription, setChatRunMachineState, setSelectedConversationState]
  )

  const getConversationSnapshot = useCallback((conversationId: string) => {
    return conversationSnapshotsRef.current.get(conversationId)
  }, [])

  const loadConversation = useCallback(
    async (conversationId: string) => {
      const nonce = ++loadConversationNonceRef.current
      const cachedConversation = conversationSnapshotsRef.current.get(conversationId)
      if (cachedConversation) {
        setSelectedConversation(cachedConversation)
      }

      const [conversationResponse, messageResponse] = await Promise.all([
        getConversation(conversationId),
        getConversationMessages(conversationId),
      ])

      if (loadConversationNonceRef.current !== nonce) {
        return
      }

      if (conversationResponse.error || messageResponse.error) {
        throw new Error('Failed loading the chat')
      }

      setSelectedConversation({
        ...conversationResponse.data,
        messages: messageResponse.data,
      })
    },
    [setSelectedConversation]
  )

  const requestStopActiveRun = useCallback(async () => {
    const current = chatRunMachineRef.current
    if (current.state !== 'receiving' && current.state !== 'reconnecting') {
      return
    }

    setChatRunMachineState(
      transitionChatRunMachine(current, {
        type: 'stop-requested',
        conversationId: current.conversationId,
        runId: current.runId,
      })
    )

    await stopChatRun(current.runId)
  }, [setChatRunMachineState])

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
    setChatRunMachineState(
      transitionChatRunMachine(chatRunMachineRef.current, {
        type: 'send-started',
        conversationId: conversation.id,
        messageId: userMessage.id,
      })
    )

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
      setChatRunMachineState(
        transitionChatRunMachine(chatRunMachineRef.current, {
          type: 'run-finished',
          conversationId: conversation.id,
        })
      )
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
      setChatRunMachineState(idleChatRunMachineState)
      return
    }

    if (isRunAttachedToConversation(chatRunMachineRef.current, conversationId)) {
      return
    }

    let canceled = false
    void (async () => {
      const response = await getActiveChatRun(conversationId)
      if (canceled) return
      const run = response.data?.run
      if (!run) {
        setChatRunMachineState(
          transitionChatRunMachine(chatRunMachineRef.current, {
            type: 'run-finished',
            conversationId,
          })
        )
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
  }, [disconnectSubscription, selectedConversation?.id, setChatRunMachineState, subscribeRun])

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
        loadConversation,
        setNewChatAssistantId,
        sendMessage,
        requestStopActiveRun,
        setChatInputElement,
        setSideBarContent,
      }}
    >
      {children}
    </ChatPageContext.Provider>
  )
}
