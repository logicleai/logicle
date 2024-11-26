import * as dto from '@/types/dto'
import { TextStreamPartController } from '@/lib/chat/TextStreamPartController'
import { ToolUILink } from '@/lib/chat/tools'
import { ChatState } from '@/lib/chat/ChatState'

export class ToolUiLinkImpl implements ToolUILink {
  controller: TextStreamPartController
  chatState: ChatState
  currentMsg?: dto.Message
  saveMessage: (message: dto.Message) => Promise<void>
  debug: boolean
  constructor(
    chatState: ChatState,
    controller: TextStreamPartController,
    saveMessage: (message: dto.Message) => Promise<void>,
    debug: boolean
  ) {
    this.chatState = chatState
    this.controller = controller
    this.saveMessage = saveMessage
    this.debug = debug
  }
  async debugMessage(displayMessage: string, data: Record<string, unknown>) {
    await this.closeCurrentMessage()
    if (this.debug) {
      const toolCallOutputMsg: dto.Message = this.chatState.createToolDebugMsg(displayMessage, data)
      this.controller.enqueueNewMessage(toolCallOutputMsg)
      this.currentMsg = toolCallOutputMsg
      await this.closeCurrentMessage()
    }
  }
  async newMessage() {
    await this.closeCurrentMessage()
    const toolCallOutputMsg: dto.Message = this.chatState.createToolOutputMsg()
    this.controller.enqueueNewMessage(toolCallOutputMsg)
    this.currentMsg = toolCallOutputMsg
  }
  appendText(delta: string) {
    this.currentMsg!.content = this.currentMsg!.content + delta
    this.controller.enqueueTextDelta(delta)
  }
  addAttachment(attachment: dto.Attachment) {
    this.currentMsg!.attachments.push(attachment)
    this.controller.enqueueAttachment(attachment)
  }

  async close() {
    await this.closeCurrentMessage()
  }

  async closeCurrentMessage() {
    if (this.currentMsg) {
      await this.chatState.push(this.currentMsg)
      await this.saveMessage(this.currentMsg)
      this.currentMsg = undefined
    }
  }
}
