interface HasStatus {
  state: string
}

interface Idle extends HasStatus {
  state: 'idle'
}

interface Sending extends HasStatus {
  state: 'sending'
  messageId: string
  abortController: AbortController
}

interface Receiving extends HasStatus {
  state: 'receiving'
  messageId: string
  abortController: AbortController
}

export type ChatStatus = Idle | Sending | Receiving
