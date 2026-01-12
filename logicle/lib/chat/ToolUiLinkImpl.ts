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
      this.clientSink.enqueueNewPart(part)
    }
  }

  addCitations(citations: dto.Citation[]) {
    this.toolMessage.citations = [...(this.toolMessage.citations ?? []), ...citations]
    this.clientSink.enqueueCitations(citations)
    this.citations = [...this.citations, ...citations]
  }
}
