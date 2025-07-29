import * as dto from '@/types/dto'

export interface ClientSink {
  enqueue(streamPart: dto.TextStreamPart): void
  enqueueNewMessage(msg: dto.Message): void
  enqueueToolCall(toolCall: dto.ToolCall): void
  enqueueToolCallResult(toolCallResult: dto.ToolCallResult): void
  enqueueSummary(summary: string): void
  enqueueTextStart(): void
  enqueueTextDelta(delta: string): void
  enqueueReasoningStart(): void
  enqueueReasoningDelta(delta: string): void
  enqueueCitations(citations: dto.Citation[]): void
  enqueueAttachment(attachment: dto.Attachment): void
}
