import type * as dto from '@/types/dto'
import type { ClientSink } from '@/backend/lib/chat/ClientSink'
import type { TurnUsage } from './types'

/**
 * A `ClientSink` that records what one assistant turn produced.
 *
 * Token counts come from the stream's own `usage` parts, which carry the same numbers Logicle
 * persists for billing — so the benchmark measures what the deployment would actually be charged
 * for, not a re-estimate. A turn can emit several `usage` parts when the model loops through tool
 * calls, so they are summed rather than replaced.
 */
export class EvalSink implements ClientSink {
  readonly events: dto.TextStreamPart[] = []

  enqueue(event: dto.TextStreamPart): void {
    this.events.push(event)
  }

  private parts(): dto.MessagePart[] {
    return this.events
      .filter((event) => event.type === 'part')
      .map((event) => (event as dto.TextStreamPart & { type: 'part'; part: dto.MessagePart }).part)
  }

  /** Everything the assistant said this turn, concatenated. */
  getText(): string {
    return this.events
      .filter(
        (event): event is dto.TextStreamPart & { type: 'text'; text: string } =>
          event.type === 'text'
      )
      .map((event) => event.text)
      .join('')
  }

  getToolCallNames(): string[] {
    return this.parts()
      .filter((part): part is dto.ToolCallPart => part.type === 'tool-call')
      .map((part) => part.toolName)
  }

  getUsage(): TurnUsage {
    return this.events
      .filter(
        (
          event
        ): event is dto.TextStreamPart & {
          type: 'usage'
          inputTokens: number
          outputTokens: number
          totalTokens: number
        } => event.type === 'usage'
      )
      .reduce(
        (total, event) => ({
          inputTokens: total.inputTokens + event.inputTokens,
          outputTokens: total.outputTokens + event.outputTokens,
          totalTokens: total.totalTokens + event.totalTokens,
        }),
        { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
      )
  }

  getErrors(): string[] {
    return this.parts()
      .filter((part): part is dto.ErrorPart => part.type === 'error')
      .map((part) => part.error)
  }
}
