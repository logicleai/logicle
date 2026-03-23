import { describe, expect, test } from 'vitest'
import {
  chatRunMachineToStatus,
  getResumeSequence,
  idleChatRunMachineState,
  isRunAttachedToConversation,
  transitionChatRunMachine,
} from '@/app/chat/components/chatRunMachine'

describe('chat run machine', () => {
  test('tracks sequence and reconnect state for the active run', () => {
    const abortController = new AbortController()

    const attached = transitionChatRunMachine(idleChatRunMachineState, {
      type: 'run-attached',
      conversationId: 'conversation-1',
      runId: 'run-1',
      abortController,
    })
    const progressed = transitionChatRunMachine(attached, {
      type: 'event-applied',
      conversationId: 'conversation-1',
      runId: 'run-1',
      sequence: 3,
      messageId: 'assistant-1',
    })
    const reconnecting = transitionChatRunMachine(progressed, {
      type: 'reconnect-scheduled',
      conversationId: 'conversation-1',
      runId: 'run-1',
      attempt: 1,
    })

    expect(getResumeSequence(reconnecting, 'conversation-1', 'run-1')).toBe(3)
    expect(isRunAttachedToConversation(reconnecting, 'conversation-1', 'run-1')).toBe(true)
    expect(chatRunMachineToStatus(reconnecting)).toEqual({
      state: 'receiving',
      runId: 'run-1',
      messageId: 'assistant-1',
      abortController,
      stopRequested: false,
    })
  })

  test('resets when selecting a different conversation', () => {
    const receiving = transitionChatRunMachine(idleChatRunMachineState, {
      type: 'run-attached',
      conversationId: 'conversation-1',
      runId: 'run-1',
      abortController: new AbortController(),
    })

    const next = transitionChatRunMachine(receiving, {
      type: 'select-conversation',
      conversationId: 'conversation-2',
    })

    expect(next).toEqual(idleChatRunMachineState)
  })

  test('marks the active run as stop-requested', () => {
    const receiving = transitionChatRunMachine(idleChatRunMachineState, {
      type: 'run-attached',
      conversationId: 'conversation-1',
      runId: 'run-1',
      abortController: new AbortController(),
    })

    const stopped = transitionChatRunMachine(receiving, {
      type: 'stop-requested',
      conversationId: 'conversation-1',
      runId: 'run-1',
    })

    expect(chatRunMachineToStatus(stopped)).toMatchObject({
      state: 'receiving',
      runId: 'run-1',
      stopRequested: true,
    })
  })
})
