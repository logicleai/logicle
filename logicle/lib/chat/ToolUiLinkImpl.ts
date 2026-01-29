import * as dto from '@/types/dto'
import { ClientSink } from '@/lib/chat/ClientSink'
import { ToolUILink } from '@/lib/chat/tools'

export class ToolUiLinkImpl implements ToolUILink {
  attachments: dto.Attachment[] = []
  citations: dto.Citation[] = []
  constructor(
    private clientSink: ClientSink,
    private toolMessage: dto.ToolMessage,
    private debug: boolean
  ) {}

  debugMessage(displayMessage: string, data: Record<string, unknown>) {
    if (this.debug) {
      const part: dto.DebugPart = {
        type: 'debug',
        displayMessage,
        data,
      }
      this.toolMessage.parts.push(part)
      this.clientSink.enqueue({ type: 'part', part })
    }
  }

  addCitations(citations: dto.Citation[]) {
    this.toolMessage.citations = [...(this.toolMessage.citations ?? []), ...citations]
    this.clientSink.enqueue({ type: 'citations', citations })
    this.citations = [...this.citations, ...citations]
  }
}
