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

    const checking = transitionChatRunMachine(idleChatRunMachineState, {
      type: 'select-conversation',
      conversationId: 'conversation-1',
    })
    const attached = transitionChatRunMachine(checking, {
      type: 'run-attached',
      conversationId: 'conversation-1',
      runId: 'run-1',
      abortController,
    })
    const opened = transitionChatRunMachine(attached, {
      type: 'subscription-opened',
      conversationId: 'conversation-1',
      runId: 'run-1',
    })
    const progressed = transitionChatRunMachine(opened, {
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
    expect(checking).toEqual({
      state: 'checking',
      conversationId: 'conversation-1',
    })
    expect(attached).toMatchObject({
      state: 'attaching',
      conversationId: 'conversation-1',
      runId: 'run-1',
    })
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

    expect(next).toEqual({
      state: 'checking',
      conversationId: 'conversation-2',
    })
  })

  test('returns to idle when the selected conversation has no active run', () => {
    const checking = transitionChatRunMachine(idleChatRunMachineState, {
      type: 'select-conversation',
      conversationId: 'conversation-1',
    })

    const next = transitionChatRunMachine(checking, {
      type: 'active-run-missing',
      conversationId: 'conversation-1',
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
