import * as dto from '@/types/dto'

export interface ClientSink {
  enqueue(streamPart: dto.TextStreamPart): void
  enqueueNewMessage(msg: dto.Message): void
  enqueueToolCall(toolCall: dto.ToolCall): void
  enqueueSummary(summary: string): void
  enqueueTextDelta(delta: string): void
  enqueueReasoningDelta(delta: string): void
  enqueueCitations(citations: dto.Citation[]): void
  enqueueAttachment(attachment: dto.Attachment): void
}
