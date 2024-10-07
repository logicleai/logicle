import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'
import { TextStreamPartController } from './TextStreamPartController'
import { ToolUILink } from '.'

export class ToolUiLinkImpl implements ToolUILink {
  controller: TextStreamPartController
  chatHistory: dto.Message[]
  currentMsg?: dto.Message
  saveMessage: (message: dto.Message) => Promise<void>
  constructor(
    chatHistory: dto.Message[],
    controller: TextStreamPartController,
    saveMessage: (message: dto.Message) => Promise<void>
  ) {
    this.chatHistory = chatHistory
    this.controller = controller
    this.saveMessage = saveMessage
  }
  newMessage() {
    this.closeCurrentMessage()
    const toolCallResultDtoMessage: dto.Message = {
      id: nanoid(),
      role: 'tool',
      content: '',
      attachments: [],
      conversationId: this.chatHistory[this.chatHistory.length - 1].conversationId,
      parent: this.chatHistory[this.chatHistory.length - 1].id,
      sentAt: new Date().toISOString(),
      toolOutput: {},
    }

    this.controller.enqueueNewMessage(toolCallResultDtoMessage)
    this.currentMsg = toolCallResultDtoMessage
    this.chatHistory.push(toolCallResultDtoMessage)
    return 'ciao'
  }
  appendText(delta: string) {
    this.currentMsg!.content = this.currentMsg!.content + delta
    this.controller.enqueueTextDelta(delta)
  }
  addAttachment(attachment: dto.Attachment) {
    this.currentMsg!.attachments.push(attachment)
    this.controller.enqueueAttachment(attachment)
  }

  close() {
    this.closeCurrentMessage()
  }

  closeCurrentMessage() {
    if (this.currentMsg) {
      this.saveMessage(this.currentMsg)
      this.currentMsg = undefined
    }
  }
}
