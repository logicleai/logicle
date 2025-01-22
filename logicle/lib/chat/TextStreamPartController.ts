import * as dto from '@/types/dto'
import { ClientGoneException } from './exceptions'

export class TextStreamPartController {
  controller: ReadableStreamDefaultController<string>
  constructor(controller: ReadableStreamDefaultController<string>) {
    this.controller = controller // Store reference to the original controller
  }

  // Wrap the enqueue method to encode the data as JSON before enqueueing
  enqueue(streamPart: dto.TextStreamPart) {
    try {
      this.controller.enqueue(`data: ${JSON.stringify(streamPart)} \n\n`) // Enqueue the JSON-encoded chunk
    } catch (e) {
      throw new ClientGoneException('Client is gone')
    }
  }

  enqueueNewMessage(msg: dto.Message) {
    this.enqueue({
      type: 'newMessage',
      content: msg,
    })
  }

  enqueueToolCall(toolCall: dto.ToolCall) {
    const msg: dto.TextStreamPart = {
      type: 'toolCall',
      content: toolCall,
    }
    this.enqueue(msg)
  }

  enqueueSummary(summary: string) {
    this.enqueue({
      type: 'summary',
      content: summary,
    })
  }

  enqueueError(text: string) {
    this.controller.enqueue(text)
  }

  enqueueTextDelta(delta: string) {
    this.enqueue({
      type: 'delta',
      content: delta,
    })
  }

  enqueueAttachment(attachment: dto.Attachment) {
    this.enqueue({
      type: 'attachment',
      content: attachment,
    })
  }

  close() {
    this.controller.close() // Proxy to the controller's close method
  }

  error(e) {
    this.controller.error(e) // Proxy to the controller's error method
  }
}
