import * as dto from '@/types/dto'
import { ClientSink } from '@/lib/chat/ClientSink'
import { ToolUILink } from '@/lib/chat/tools'
import { ChatState } from '@/lib/chat/ChatState'

export class ToolUiLinkImpl implements ToolUILink {
  attachments: dto.Attachment[] = []
  citations: dto.Citation[] = []
  constructor(
    private clientSink: ClientSink,
    private chatState: ChatState,
    private debug: boolean
  ) {}

  debugMessage(displayMessage: string, data: Record<string, unknown>) {
    if (this.debug) {
      const part: dto.DebugPart = {
        type: 'debug',
        displayMessage,
        data,
      }
      this.chatState.applyStreamPart({ type: 'part', part })
      this.clientSink.enqueue({ type: 'part', part })
    }
  }

  addCitations(citations: dto.Citation[]) {
    this.chatState.applyStreamPart({ type: 'citations', citations })
    this.clientSink.enqueue({ type: 'citations', citations })
    this.citations = [...this.citations, ...citations]
  }
}
