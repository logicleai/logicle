import * as dto from '@/types/dto'

const isImageMimeType = (mimetype: string) => mimetype.startsWith('image/')
const projectionCache = new WeakMap<dto.Message, ProjectedMessageForEstimation>()

/**
 * Generates a concise per-file metadata descriptor for interspersed mode.
 * If name is absent/empty, falls back to 'pasted image' for images or 'pasted' otherwise.
 */
export const fileDescriptorText = (
  name: string | null | undefined,
  id: string,
  mimetype: string,
  size: number,
  ordinal: number,
  label: 'Attachment' | 'Knowledge'
): string => {
  const displayName = name?.trim() ? name.trim() : isImageMimeType(mimetype) ? 'pasted image' : 'pasted'
  return `${label} ${ordinal}: ${displayName} (id ${id}, ${mimetype}, ${size} bytes)`
}

export const userMessageMetadataText = (message: dto.UserMessage): string | undefined =>
  message.metadata
    ? `Message metadata (system-use): ${JSON.stringify(message.metadata)}`
    : undefined

export const shouldIncludeAssistantReasoningPart = (part: dto.ReasoningPart): boolean =>
  Boolean(part.reasoning_signature)

export const projectedAssistantToolCallPayload = (part: dto.ToolCallPart) => ({
  toolCallId: part.toolCallId,
  toolName: part.toolName,
  input: part.args,
})

export const projectedToolResultMetaPayload = (part: dto.ToolCallResultPart) => ({
  toolCallId: part.toolCallId,
  toolName: part.toolName,
})

export type MessageProjectionItem =
  | {
      kind: 'text'
      text: string
      source?: 'content' | 'metadata' | 'attachment_descriptor' | 'assistant_text' | 'assistant_reasoning'
      reasoningSignature?: string
    }
  | {
      kind: 'attachment'
      attachment: dto.Attachment
    }
  | {
      kind: 'tool_call'
      toolCallId: string
      toolName: string
      payload: ReturnType<typeof projectedAssistantToolCallPayload>
      thoughtSignature?: string
    }
  | {
      kind: 'tool_result'
      toolCallId: string
      toolName: string
      metaPayload: ReturnType<typeof projectedToolResultMetaPayload>
      output: dto.ToolCallResultOutput
    }

export type ProjectedMessageForEstimation =
  | { role: 'user' | 'assistant' | 'tool'; items: MessageProjectionItem[] }
  | { role: 'ignored'; items: [] }

export const projectMessageForEstimation = (
  message: dto.Message
): ProjectedMessageForEstimation => {
  const cached = projectionCache.get(message)
  if (cached) return cached
  if (message.role === 'user-request' || message.role === 'user-response') {
    const projected: ProjectedMessageForEstimation = { role: 'ignored', items: [] }
    projectionCache.set(message, projected)
    return projected
  }
  if (message.role === 'user') {
    const items: MessageProjectionItem[] = []
    const metadataText = userMessageMetadataText(message)
    if (metadataText) items.push({ kind: 'text', text: metadataText, source: 'metadata' })
    if (message.content.length !== 0) items.push({ kind: 'text', text: message.content, source: 'content' })
    message.attachments.forEach((attachment, index) => {
      items.push({
        kind: 'text',
        text: fileDescriptorText(attachment.name, attachment.id, attachment.mimetype, attachment.size, index + 1, 'Attachment'),
        source: 'attachment_descriptor',
      })
      items.push({ kind: 'attachment', attachment })
    })
    const projected: ProjectedMessageForEstimation = { role: 'user', items }
    projectionCache.set(message, projected)
    return projected
  }
  if (message.role === 'assistant') {
    const items: MessageProjectionItem[] = []
    for (const part of message.parts) {
      if (part.type === 'text') {
        items.push({ kind: 'text', text: part.text, source: 'assistant_text' })
      } else if (part.type === 'reasoning' && shouldIncludeAssistantReasoningPart(part)) {
        items.push({
          kind: 'text',
          text: part.reasoning,
          source: 'assistant_reasoning',
          reasoningSignature: part.reasoning_signature,
        })
      } else if (part.type === 'tool-call') {
        const payload = projectedAssistantToolCallPayload(part)
        items.push({
          kind: 'tool_call',
          toolCallId: part.toolCallId,
          toolName: part.toolName,
          payload,
          thoughtSignature: part.thoughtSignature,
        })
      }
    }
    const projected: ProjectedMessageForEstimation = { role: 'assistant', items }
    projectionCache.set(message, projected)
    return projected
  }
  const items: MessageProjectionItem[] = []
  for (const part of message.parts) {
    if (part.type !== 'tool-result') continue
    items.push({
      kind: 'tool_result',
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      metaPayload: projectedToolResultMetaPayload(part),
      output: part.result,
    })
  }
  const projected: ProjectedMessageForEstimation = { role: 'tool', items }
  projectionCache.set(message, projected)
  return projected
}

export const projectMessageForEstimationCached = projectMessageForEstimation

const renderToolResultOutput = (toolName: string, output: dto.ToolCallResultOutput): string => {
  if (output.type === 'text' || output.type === 'error-text') {
    return `Tool "${toolName}" result: ${output.value}`
  }
  if (output.type === 'json' || output.type === 'error-json') {
    return `Tool "${toolName}" result: ${JSON.stringify(output.value)}`
  }
  const parts = output.value.map((v, index) =>
    v.type === 'text' ? v.text : fileDescriptorText(v.name, v.id, v.mimetype, v.size, index + 1, 'Attachment')
  )
  return `Tool "${toolName}" result:\n${parts.join('\n')}`
}

/**
 * Renders a message's *original, uncompressed* content as plain text — used by the
 * `context-retrieve` tool's `get_message` and `search` functions, which operate directly on the
 * live conversation history (never a compressed representation). See docs/context-compression.md.
 */
export const renderMessagePlainText = (message: dto.Message): string => {
  if (message.role === 'user-request' || message.role === 'user-response') {
    return `[${message.role} message, no textual content]`
  }
  const projected = projectMessageForEstimation(message)
  const lines: string[] = []
  for (const item of projected.items) {
    if (item.kind === 'text') {
      lines.push(item.text)
    } else if (item.kind === 'tool_call') {
      lines.push(`Called tool "${item.toolName}" with args: ${JSON.stringify(item.payload.input)}`)
    } else if (item.kind === 'tool_result') {
      lines.push(renderToolResultOutput(item.toolName, item.output))
    }
  }
  return lines.join('\n')
}
