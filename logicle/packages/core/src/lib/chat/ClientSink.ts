import * as dto from '@/types/dto'

export interface ClientSink {
  enqueue(streamPart: dto.TextStreamPart): void
}
