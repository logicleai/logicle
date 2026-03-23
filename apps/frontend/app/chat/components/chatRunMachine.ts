import { ChatStatus } from './ChatStatus'

export type ChatRunMachineState =
  | {
      state: 'idle'
    }
  | {
      state: 'checking'
      conversationId: string
    }
  | {
      state: 'sending'
      conversationId: string
      messageId: string
    }
  | {
      state: 'attaching' | 'receiving' | 'reconnecting'
      conversationId: string
      runId: string
      abortController: AbortController
      messageId?: string
      lastSequence: number
      attempt: number
      stopRequested: boolean
    }

type AttachedChatRunMachineState = Extract<
  ChatRunMachineState,
  {
    state: 'attaching' | 'receiving' | 'reconnecting'
  }
>

export const idleChatRunMachineState: ChatRunMachineState = {
  state: 'idle',
}

export const chatRunMachineToStatus = (state: ChatRunMachineState): ChatStatus => {
  switch (state.state) {
    case 'idle':
    case 'checking':
      return { state: 'idle' }
    case 'sending':
      return {
        state: 'sending',
        messageId: state.messageId,
      }
    case 'attaching':
    case 'receiving':
    case 'reconnecting':
      return {
        state: 'receiving',
        runId: state.runId,
        messageId: state.messageId,
        abortController: state.abortController,
        stopRequested: state.stopRequested,
      }
  }
}

export const isRunAttachedToConversation = (
  state: ChatRunMachineState,
  conversationId: string,
  runId?: string
) => {
  if (state.state !== 'attaching' && state.state !== 'receiving' && state.state !== 'reconnecting') {
    return false
  }

  return state.conversationId === conversationId && (!runId || state.runId === runId)
}

export const getResumeSequence = (
  state: ChatRunMachineState,
  conversationId: string,
  runId: string
) => {
  return isAttachedState(state) && isRunAttachedToConversation(state, conversationId, runId)
    ? state.lastSequence
    : 0
}

const isAttachedState = (state: ChatRunMachineState): state is AttachedChatRunMachineState => {
  return state.state === 'attaching' || state.state === 'receiving' || state.state === 'reconnecting'
}

export const transitionChatRunMachine = (
  current: ChatRunMachineState,
  event:
    | {
        type: 'select-conversation'
        conversationId?: string
      }
    | {
        type: 'send-started'
        conversationId: string
        messageId: string
      }
    | {
        type: 'run-attached'
        conversationId: string
        runId: string
        abortController: AbortController
        afterSequence?: number
      }
    | {
        type: 'subscription-opened'
        conversationId: string
        runId: string
      }
    | {
        type: 'event-applied'
        conversationId: string
        runId: string
        sequence: number
        messageId?: string
      }
    | {
        type: 'reconnect-scheduled'
        conversationId: string
        runId: string
        attempt: number
      }
    | {
        type: 'stop-requested'
        conversationId: string
        runId: string
      }
    | {
        type: 'active-run-missing'
        conversationId: string
      }
    | {
        type: 'run-finished'
        conversationId: string
        runId?: string
      }
): ChatRunMachineState => {
  switch (event.type) {
    case 'select-conversation':
      if (!event.conversationId) {
        return idleChatRunMachineState
      }
      if ('conversationId' in current) {
        if (current.conversationId === event.conversationId) {
          return current
        }
        return {
          state: 'checking',
          conversationId: event.conversationId,
        }
      }
      return {
        state: 'checking',
        conversationId: event.conversationId,
      }

    case 'send-started':
      return {
        state: 'sending',
        conversationId: event.conversationId,
        messageId: event.messageId,
      }

    case 'run-attached':
      return {
        state: 'attaching',
        conversationId: event.conversationId,
        runId: event.runId,
        abortController: event.abortController,
        messageId:
          isAttachedState(current) &&
          isRunAttachedToConversation(current, event.conversationId, event.runId)
            ? current.messageId
            : undefined,
        lastSequence:
          event.afterSequence ?? getResumeSequence(current, event.conversationId, event.runId),
        attempt: 0,
        stopRequested:
          isAttachedState(current) &&
          isRunAttachedToConversation(current, event.conversationId, event.runId)
            ? current.stopRequested
            : false,
      }

    case 'subscription-opened':
      if (!isAttachedState(current) || !isRunAttachedToConversation(current, event.conversationId, event.runId)) {
        return current
      }
      return {
        ...current,
        state: 'receiving',
      }

    case 'event-applied':
      if (!isAttachedState(current) || !isRunAttachedToConversation(current, event.conversationId, event.runId)) {
        return current
      }
      return {
        ...current,
        state: 'receiving',
        lastSequence: event.sequence,
        messageId: event.messageId ?? current.messageId,
      }

    case 'reconnect-scheduled':
      if (!isAttachedState(current) || !isRunAttachedToConversation(current, event.conversationId, event.runId)) {
        return current
      }
      return {
        ...current,
        state: 'reconnecting',
        attempt: event.attempt,
      }

    case 'stop-requested':
      if (!isAttachedState(current) || !isRunAttachedToConversation(current, event.conversationId, event.runId)) {
        return current
      }
      return {
        ...current,
        stopRequested: true,
      }

    case 'active-run-missing':
      if (
        (current.state === 'checking' || current.state === 'sending') &&
        current.conversationId === event.conversationId
      ) {
        return idleChatRunMachineState
      }
      return current

    case 'run-finished':
      if (
        (current.state === 'sending' || current.state === 'checking') &&
        current.conversationId === event.conversationId &&
        !event.runId
      ) {
        return idleChatRunMachineState
      }
      if (
        isAttachedState(current) &&
        isRunAttachedToConversation(current, event.conversationId) &&
        (!event.runId || current.runId === event.runId)
      ) {
        return idleChatRunMachineState
      }
      return current
  }
}
