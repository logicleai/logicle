import { nanoid } from 'nanoid'
import * as dto from '@/types/dto'

type Subscriber = {
  onEvent: (event: ChatRunEventRecord) => void
  onClose: () => void
}

export type ChatRunEventRecord = {
  id: string
  runId: string
  sequence: number
  payload: dto.TextStreamPart
  createdAt: string
}

type RuntimeState = {
  run: dto.ChatRun
  abortController: AbortController
  events: ChatRunEventRecord[]
  subscribers: Set<Subscriber>
  cleanupTimer?: ReturnType<typeof setTimeout>
}

const runtimesByRunId = new Map<string, RuntimeState>()
const activeRunIdsByConversationId = new Map<string, string>()

const cloneRun = (run: dto.ChatRun): dto.ChatRun => ({ ...run })

export const createChatRun = ({
  conversationId,
  ownerId,
  requestMessageId,
}: {
  conversationId: string
  ownerId: string
  requestMessageId: string
}) => {
  const existing = activeRunIdsByConversationId.get(conversationId)
  if (existing) {
    const runtime = runtimesByRunId.get(existing)
    if (runtime) {
      return { ok: false as const, run: cloneRun(runtime.run) }
    }
    activeRunIdsByConversationId.delete(conversationId)
  }

  const now = new Date().toISOString()
  const run: dto.ChatRun = {
    id: nanoid(),
    conversationId,
    ownerId,
    requestMessageId,
    status: 'running',
    stopRequestedAt: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    lastEventSequence: 0,
    error: null,
  }
  const runtime: RuntimeState = {
    run,
    abortController: new AbortController(),
    events: [],
    subscribers: new Set(),
    cleanupTimer: undefined,
  }
  runtimesByRunId.set(run.id, runtime)
  activeRunIdsByConversationId.set(conversationId, run.id)
  return { ok: true as const, run: cloneRun(run), abortController: runtime.abortController }
}

export const getChatRunById = (runId: string) => {
  const runtime = runtimesByRunId.get(runId)
  return runtime ? cloneRun(runtime.run) : undefined
}

export const getActiveChatRunForConversation = (conversationId: string) => {
  const runId = activeRunIdsByConversationId.get(conversationId)
  if (!runId) return undefined
  const runtime = runtimesByRunId.get(runId)
  if (!runtime) {
    activeRunIdsByConversationId.delete(conversationId)
    return undefined
  }
  return cloneRun(runtime.run)
}

export const listChatRunEvents = ({
  runId,
  afterSequence = 0,
}: {
  runId: string
  afterSequence?: number
}) => {
  const runtime = runtimesByRunId.get(runId)
  if (!runtime) return []
  return runtime.events.filter((event) => event.sequence > afterSequence)
}

export const persistAndPublishChatRunEvent = async (runId: string, payload: dto.TextStreamPart) => {
  const runtime = runtimesByRunId.get(runId)
  if (!runtime) {
    throw new Error(`No active chat run with id ${runId}`)
  }
  const event: ChatRunEventRecord = {
    id: nanoid(),
    runId,
    sequence: runtime.run.lastEventSequence + 1,
    payload,
    createdAt: new Date().toISOString(),
  }
  runtime.events.push(event)
  runtime.run = {
    ...runtime.run,
    lastEventSequence: event.sequence,
    updatedAt: event.createdAt,
  }
  for (const subscriber of runtime.subscribers) {
    subscriber.onEvent(event)
  }
  return event
}

export const subscribeToChatRunRuntime = (runId: string, subscriber: Subscriber) => {
  const runtime = runtimesByRunId.get(runId)
  if (!runtime) {
    return () => {}
  }
  runtime.subscribers.add(subscriber)
  return () => {
    runtime.subscribers.delete(subscriber)
  }
}

export const requestChatRunStop = (runId: string) => {
  const runtime = runtimesByRunId.get(runId)
  if (!runtime) return undefined
  if (runtime.run.status !== 'running') {
    return cloneRun(runtime.run)
  }
  if (!runtime.run.stopRequestedAt) {
    const now = new Date().toISOString()
    runtime.run = {
      ...runtime.run,
      stopRequestedAt: now,
      updatedAt: now,
    }
    runtime.abortController.abort()
  }
  return cloneRun(runtime.run)
}

export const finalizeChatRun = ({
  runId,
  status,
  error,
}: {
  runId: string
  status: Extract<dto.ChatRunStatus, 'completed' | 'failed' | 'stopped'>
  error?: string | null
}) => {
  const runtime = runtimesByRunId.get(runId)
  if (!runtime) return
  const now = new Date().toISOString()
  runtime.run = {
    ...runtime.run,
    status,
    error: error ?? null,
    updatedAt: now,
    completedAt: now,
  }
  activeRunIdsByConversationId.delete(runtime.run.conversationId)
  for (const subscriber of runtime.subscribers) {
    subscriber.onClose()
  }
  runtime.subscribers.clear()
  if (runtime.cleanupTimer) {
    clearTimeout(runtime.cleanupTimer)
  }
  runtime.cleanupTimer = setTimeout(() => {
    closeChatRun(runId)
  }, 60_000)
}

export const closeChatRun = (runId: string) => {
  const runtime = runtimesByRunId.get(runId)
  if (!runtime) return
  if (runtime.cleanupTimer) {
    clearTimeout(runtime.cleanupTimer)
  }
  runtimesByRunId.delete(runId)
}

export const isChatRunAbortError = (error: unknown, signal?: AbortSignal) => {
  if (signal?.aborted) return true
  if (error instanceof Error && error.name === 'AbortError') return true
  if (typeof error === 'object' && error !== null && 'name' in error) {
    return (error as { name?: string }).name === 'AbortError'
  }
  return false
}
