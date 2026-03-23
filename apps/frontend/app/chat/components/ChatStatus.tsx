interface HasStatus {
  state: string
}

interface Idle extends HasStatus {
  state: 'idle'
}

interface Sending extends HasStatus {
  state: 'sending'
  messageId: string
}

interface Receiving extends HasStatus {
  state: 'receiving'
  runId: string
  messageId?: string
  abortController: AbortController
  stopRequested?: boolean
}

export type ChatStatus = Idle | Sending | Receiving
