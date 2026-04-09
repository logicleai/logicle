import { postBlob } from '@/lib/fetch'
import * as dto from '@/types/dto'

export const exportConversationDocx = async (
  conversationId: string,
  payload: dto.ConversationDocxExportRequest
) => {
  return await postBlob(`/api/conversations/${conversationId}/export/docx`, payload)
}
