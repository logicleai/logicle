import * as dto from '@/types/dto'

export interface ClientSink {
  enqueue(streamPart: dto.TextStreamPart): void
  enqueueNewMessage(msg: dto.Message): void
  enqueueNewPart(part: dto.AssistantMessagePart): void
  enqueueSummary(summary: string): void
  enqueueTextDelta(delta: string): void
  enqueueReasoningDelta(delta: string): void
  enqueueCitations(citations: dto.Citation[]): void
  enqueueAttachment(attachment: dto.Attachment): void
}
