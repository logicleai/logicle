import * as dto from '@/types/dto'

export const userMessageMetadataText = (message: dto.UserMessage): string | undefined =>
  message.metadata
    ? `Message metadata (system-use): ${JSON.stringify(message.metadata)}`
    : undefined

export const userAttachmentDescriptorText = (message: dto.UserMessage): string | undefined =>
  message.attachments.length === 0
    ? undefined
    : `The user has attached the following files to this chat: \n${JSON.stringify(message.attachments)}`

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

export type EstimationProjectionItem =
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
    }
  | {
      kind: 'tool_result'
      toolCallId: string
      toolName: string
      metaPayload: ReturnType<typeof projectedToolResultMetaPayload>
      output: dto.ToolCallResultOutput
    }

export type EstimationMessageProjection =
  | { role: 'user' | 'assistant' | 'tool'; items: EstimationProjectionItem[] }
  | { role: 'ignored'; items: [] }

export const projectMessageForEstimation = (message: dto.Message): EstimationMessageProjection => {
  if (message.role === 'user-request' || message.role === 'user-response') {
    return { role: 'ignored', items: [] }
  }
  if (message.role === 'user') {
    const items: EstimationProjectionItem[] = []
    const metadataText = userMessageMetadataText(message)
    if (metadataText) items.push({ kind: 'text', text: metadataText, source: 'metadata' })
    if (message.content.length !== 0) items.push({ kind: 'text', text: message.content, source: 'content' })
    const attachmentDescriptorText = userAttachmentDescriptorText(message)
    if (attachmentDescriptorText) {
      items.push({
        kind: 'text',
        text: attachmentDescriptorText,
        source: 'attachment_descriptor',
      })
    }
    for (const attachment of message.attachments) {
      items.push({ kind: 'attachment', attachment })
    }
    return { role: 'user', items }
  }
  if (message.role === 'assistant') {
    const items: EstimationProjectionItem[] = []
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
        })
      }
    }
    return { role: 'assistant', items }
  }
  const items: EstimationProjectionItem[] = []
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
  return { role: 'tool', items }
}
