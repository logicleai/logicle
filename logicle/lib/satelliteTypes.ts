import { CallToolResult } from '@modelcontextprotocol/sdk/types'
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

export interface ToolCallMessage {
  type: 'tool-call'
  id: string
  method: string
  params: unknown
}

export interface ToolResultMessage extends CallToolResult {
  type: 'tool-result'
  id: string
}

export interface ToolOutputMessage {
  type: 'tool-output'
  id: string
  attachment?: {
    id: string
    type: string
    name: string
    size: number
  }
}

export type Message = RegisterMessage | ToolCallMessage | ToolResultMessage | ToolOutputMessage
