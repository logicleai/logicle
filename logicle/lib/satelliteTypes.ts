import { JSONSchema7 } from 'json-schema'

export interface Tool {
  name: string
  description: string
  inputSchema?: JSONSchema7
  outputSchema?: JSONSchema7
  annotations?: Record<string, any>
}

export interface RegisterMessage {
  type: 'register'
  name: string
  tools: Tool[]
}

export interface CallMessage {
  type: 'call'
  id: string
  method: string
  params: unknown
}

export interface ResponseMessage {
  type: 'response'
  id: string
  ok: boolean
  result?: unknown
  error?: string
}

export type Message = RegisterMessage | ResponseMessage | CallMessage
