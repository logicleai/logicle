'use client'
import ChatPageContext, {
  ImageEditorState,
  SendMessageParams,
  SideBarContent,
} from '@/app/chat/components/context'
import { ChatPageState, defaultChatPageState } from '@/app/chat/components/state'
import { useCreateReducer } from '@/hooks/useCreateReducer'
import { FC, ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { useClientNavigate, useClientPathname } from '@/lib/clientRouter'
import { ChatStatus } from './ChatStatus'
import { nanoid } from 'nanoid'
import * as dto from '@/types/dto'
import { useTranslation } from 'react-i18next'
import { ConversationWithMessages } from '@/lib/chat/types'
import { ImageEditorModal } from './ImageEditorModal'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { applyStreamPartToMessages } from '@/lib/chat/streamApply'
import { getActiveChatRun, startChatRun, stopChatRun, subscribeToChatRun } from '@/services/chat'
import {
  createConversation,
  getConversation,
  getConversationMessages,
} from '@/services/conversation'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { imageGenToolNames } from '@/lib/tools/tools'
import {
  chatRunMachineToStatus,
  getResumeSequence,
  idleChatRunMachineState,
  isRunAttachedToConversation,
  transitionChatRunMachine,
  type ChatRunMachineState,
} from './chatRunMachine'
import { maintainChatRunSubscription } from './chatRunSubscription'
import {
  applyChatRunEventToConversation,
  applyChatRunFailureToConversation,
  removePlaceholderIfPresent,
  THINKING_PLACEHOLDER_ID,
} from './chatRunConversationState'

interface Props {
  children: ReactNode
}

// `/chat/<id>` is the only route shape here: assistants/select, assistants/mine
// and folders/[folderId] all have a further path segment, so a bare two-segment
// /chat/<x> unambiguously means "an existing chat", never one of those.
const chatIdFromPathname = (pathname: string): string | undefined => {
  const segments = pathname.split('/').filter(Boolean)
  return segments.length === 2 && segments[0] === 'chat'
    ? decodeURIComponent(segments[1])
    : undefined
}

export const ChatPageContextProvider: FC<Props> = ({ children }) => {
  const userProfile = useUserProfile()
  const contextValue = useCreateReducer<ChatPageState>({
    initialState: {
      ...defaultChatPageState,
      newChatAssistantId: userProfile?.lastUsedAssistant?.id ?? null,
    },
  })

  // See lib/clientRouter.tsx for why chat navigation goes through this
  // instead of next/navigation.
  const pathname = useClientPathname()
  const clientNavigate = useClientNavigate()
  const urlChatId = chatIdFromPathname(pathname)
  const navigateToChat = useCallback(
    (chatId: string | undefined) => clientNavigate(chatId ? `/chat/${chatId}` : '/chat'),
    [clientNavigate]
  )

  const [imageEditorState, setImageEditorState] = useState<ImageEditorState | null>(null)

  const {
    state: { selectedConversation },
    dispatch,
  } = contextValue

  const canEditImages = Boolean(
    selectedConversation &&
      userProfile?.assistants
        .find((assistant) => assistant.id === selectedConversation.assistantId)
        ?.tools.some((tool) => imageGenToolNames.has(tool.type))
  )

  const openImageEditor = useCallback(
    (attachment: dto.Attachment, options?: { conversationId?: string; startNewChat?: boolean }) => {
      if (!options?.startNewChat && !canEditImages) return
      setImageEditorState({
        attachment,
        conversationId: options?.conversationId,
        startNewChat: options?.startNewChat,
      })
    },
    [canEditImages]
  )

  const selectedConversationRef = useRef<ConversationWithMessages | undefined>(undefined)
  const chatRunMachineRef = useRef<ChatRunMachineState>(idleChatRunMachineState)
  const subscriptionNonceRef = useRef(0)
  const loadConversationNonceRef = useRef(0)
  const { t } = useTranslation()

  const setSelectedConversationState = useCallback(
    (conversation: ConversationWithMessages | undefined) => {
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
        (chatRunMachineRef.current.state === 'attaching' ||
          chatRunMachineRef.current.state === 'receiving') &&
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

      await maintainChatRunSubscription({
        conversationId,
        runId,
        attempt,
        signal: abortController.signal,
        getAfterSequence: () => getResumeSequence(chatRunMachineRef.current, conversationId, runId),
        subscribe: ({ runId, afterSequence, signal, onOpen, onEvent, onClose }) =>
          subscribeToChatRun({
            runId,
            afterSequence,
            signal,
            onOpen,
            onEvent,
            onClose,
          }),
        getActiveRun: async (conversationId) => {
          const response = await getActiveChatRun(conversationId)
          if (response.error) {
            // Don't mistake "couldn't ask" for "no active run": returning
            // undefined here would end the run silently with no error shown.
            throw new Error(response.error.message)
          }
          return response.data.run
        },
        waitForReconnect,
        onOpen() {
          if (subscriptionNonceRef.current !== nonce) return
          setChatRunMachineState(
            transitionChatRunMachine(chatRunMachineRef.current, {
              type: 'subscription-opened',
              conversationId,
              runId,
            })
          )
        },
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
          }
          setSelectedConversationState(applyChatRunEventToConversation(currentConversation, event))
        },
        onReconnect(nextAttempt) {
          if (subscriptionNonceRef.current !== nonce) return
          setChatRunMachineState(
            transitionChatRunMachine(chatRunMachineRef.current, {
              type: 'reconnect-scheduled',
              conversationId,
              runId,
              attempt: nextAttempt,
            })
          )
        },
        onFinished() {
          if (subscriptionNonceRef.current !== nonce) return
          const machineState = chatRunMachineRef.current
          const stopRequested =
            isRunAttachedToConversation(machineState, conversationId, runId) &&
            'stopRequested' in machineState &&
            machineState.stopRequested
          const currentConversation = selectedConversationRef.current
          if (currentConversation?.id === conversationId) {
            const cleaned = removePlaceholderIfPresent(currentConversation)
            if (cleaned !== currentConversation) {
              // The run finished without ever producing an assistant message.
              // Unless the user stopped it, that's a failure the backend could
              // not report: show it instead of silently dropping the placeholder.
              setSelectedConversationState(
                stopRequested
                  ? cleaned
                  : applyChatRunFailureToConversation({
                      conversation: currentConversation,
                      error: t('chat-response-failure'),
                    })
              )
            }
          }
          setChatRunMachineState(
            transitionChatRunMachine(chatRunMachineRef.current, {
              type: 'run-finished',
              conversationId,
              runId,
            })
          )
          void mutate('/api/conversations')
          void mutate('/api/me/token-rate-limit')
        },
        onFailed(error) {
          if (abortController.signal.aborted || subscriptionNonceRef.current !== nonce) {
            return
          }
          const currentConversation = selectedConversationRef.current
          if (currentConversation?.id === conversationId) {
            setSelectedConversationState(
              applyChatRunFailureToConversation({
                conversation: currentConversation,
                error: t('chat-response-failure'),
              })
            )
          }
          setChatRunMachineState(
            transitionChatRunMachine(chatRunMachineRef.current, {
              type: 'run-finished',
              conversationId,
              runId,
            })
          )
          console.error(error)
        },
        isCanceled: () => subscriptionNonceRef.current !== nonce,
      })
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
      setSelectedConversationState(conversation)
      setChatRunMachineState(nextMachineState)
    },
    [disconnectSubscription, setChatRunMachineState, setSelectedConversationState]
  )

  const getConversationSnapshot = useCallback((_conversationId: string) => {
    return undefined
  }, [])

  const loadConversation = useCallback(
    async (conversationId: string) => {
      const nonce = ++loadConversationNonceRef.current
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
    const thinkingPlaceholder: dto.AssistantMessage = {
      id: THINKING_PLACEHOLDER_ID,
      role: 'assistant',
      parts: [],
      conversationId: conversation.id,
      parent: userMessage.id,
      sentAt: new Date().toISOString(),
    }
    const optimisticConversation = {
      ...conversation,
      messages: applyStreamPartToMessages(
        applyStreamPartToMessages(conversation.messages, { type: 'message', msg: userMessage }),
        { type: 'message', msg: thinkingPlaceholder }
      ),
    }

    setSelectedConversationState(optimisticConversation)
    setChatRunMachineState(
      transitionChatRunMachine(chatRunMachineRef.current, {
        type: 'send-started',
        conversationId: conversation.id,
        messageId: userMessage.id,
      })
    )

    const conversationId = conversation.id
    const failSend = (message?: string) => {
      const latestConversation = selectedConversationRef.current
      if (latestConversation?.id === conversationId) {
        setSelectedConversationState(
          applyChatRunFailureToConversation({
            conversation: latestConversation,
            error: t(message || 'chat-response-failure'),
          })
        )
      }
      setChatRunMachineState(
        transitionChatRunMachine(chatRunMachineRef.current, {
          type: 'run-finished',
          conversationId,
        })
      )
    }

    // Callers fire and forget: nothing above us handles a rejection, so any
    // throw here must be converted into a visible failure, or the chat would
    // stay stuck on the thinking placeholder with no error shown.
    try {
      const response = await startChatRun(userMessage)
      if (response.error) {
        failSend(response.error.message)
        return
      }

      await subscribeRun({
        conversationId,
        runId: response.data.id,
      })
    } catch (error) {
      console.error(error)
      failSend()
    }
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
            type: 'active-run-missing',
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
        urlChatId,
        navigateToChat,
        setSelectedConversation,
        getConversationSnapshot,
        loadConversation,
        setNewChatAssistantId,
        sendMessage,
        requestStopActiveRun,
        setSideBarContent,
        openImageEditor,
        canEditImages,
      }}
    >
      {children}
      {imageEditorState && (
        <ImageEditorModal
          attachment={imageEditorState.attachment}
          assistants={
            imageEditorState.startNewChat
              ? userProfile?.assistants.filter((a) =>
                  a.tools.some((t) => imageGenToolNames.has(t.type))
                )
              : undefined
          }
          onClose={() => setImageEditorState(null)}
          onSubmit={async (prompt, attachment, pickedAssistantId) => {
            setImageEditorState(null)
            const shouldStartNewChat = !!imageEditorState.startNewChat
            let targetConversation = selectedConversationRef.current

            if (shouldStartNewChat) {
              const assistantId = pickedAssistantId
              if (!assistantId) {
                toast.error(t('something-went-wrong'))
                return
              }

              const customName = t('new-chat')
              const created = await createConversation({
                name: customName,
                assistantId,
              })
              if (created.error) {
                toast.error(created.error.message ?? t('something-went-wrong'))
                return
              }
              await mutate('/api/conversations')
              targetConversation = { ...created.data, messages: [] }
              setSelectedConversationState(targetConversation)
              navigateToChat(created.data.id)
            }

            if (!targetConversation) return
            await sendMessage({
              msg: {
                role: 'user',
                content: prompt,
                metadata: {
                  imageEdit: {
                    referenceAttachmentId: attachment.id,
                    sourceConversationId: imageEditorState.conversationId ?? null,
                  },
                },
              },
              conversation: targetConversation,
            })
          }}
        />
      )}
    </ChatPageContext.Provider>
  )
}
