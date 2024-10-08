import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'
import { TextStreamPartController } from './TextStreamPartController'
import { ToolUILink } from '.'
import { ChatState } from './ChatState'

export class ToolUiLinkImpl implements ToolUILink {
  controller: TextStreamPartController
  chatState: ChatState
  currentMsg?: dto.Message
  saveMessage: (message: dto.Message) => Promise<void>
  constructor(
    chatState: ChatState,
    controller: TextStreamPartController,
    saveMessage: (message: dto.Message) => Promise<void>
  ) {
    this.chatState = chatState
    this.controller = controller
    this.saveMessage = saveMessage
  }
  newMessage() {
    this.closeCurrentMessage()
    const toolCallOuputMsg: dto.Message = this.chatState.createToolOutputMsg()
    this.controller.enqueueNewMessage(toolCallOuputMsg)
    this.currentMsg = toolCallOuputMsg
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
      this.chatState.push(this.currentMsg)
      this.saveMessage(this.currentMsg)
      this.currentMsg = undefined
    }
  }
}
