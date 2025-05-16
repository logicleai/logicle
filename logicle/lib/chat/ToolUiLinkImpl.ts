import * as dto from '@/types/dto'
import { ClientSink } from '@/lib/chat/ClientSink'
import { ToolUILink } from '@/lib/chat/tools'
import { ChatState } from '@/lib/chat/ChatState'

export class ToolUiLinkImpl implements ToolUILink {
  clientSink: ClientSink
  chatState: ChatState
  currentMsg?: dto.Message & {
    reasoning?: string
    citations?: dto.Citation[]
  }
  attachments: dto.Attachment[] = []
  citations: dto.Citation[] = []
  saveMessage: (message: dto.Message) => Promise<void>
  debug: boolean
  constructor(
    chatState: ChatState,
    clientSink: ClientSink,
    saveMessage: (message: dto.Message) => Promise<void>,
    debug: boolean
  ) {
    this.chatState = chatState
    this.clientSink = clientSink
    this.saveMessage = saveMessage
    this.debug = debug
  }

  async debugMessage(displayMessage: string, data: Record<string, unknown>) {
    await this.closeCurrentMessage()
    if (this.debug) {
      const toolCallOutputMsg: dto.Message = this.chatState.createToolDebugMsg(displayMessage, data)
      this.clientSink.enqueueNewMessage(toolCallOutputMsg)
      this.currentMsg = toolCallOutputMsg
      await this.closeCurrentMessage()
    }
  }
  async newMessage() {
    await this.closeCurrentMessage()
    const toolCallOutputMsg: dto.ToolOutputMessage = this.chatState.createToolOutputMsg()
    this.clientSink.enqueueNewMessage(toolCallOutputMsg)
    this.currentMsg = toolCallOutputMsg
  }

  appendText(delta: string) {
    this.currentMsg!.content = this.currentMsg!.content + delta
    this.clientSink.enqueueTextDelta(delta)
  }

  addAttachment(attachment: dto.Attachment) {
    this.currentMsg!.attachments.push(attachment)
    this.clientSink.enqueueAttachment(attachment)
    this.attachments.push(attachment)
  }

  addCitations(citations: dto.Citation[]) {
    this.currentMsg!.citations = [...(this.currentMsg!.citations ?? []), ...citations]
    this.clientSink.enqueueCitations(citations)
    this.citations = [...this.citations, ...citations]
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
