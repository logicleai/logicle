import type { FileOwnerRef } from '@/backend/lib/files/materialize'
import type { ToolInvokeParams } from '@/lib/chat/tools'

export const resolveFileOwner = (
  params: Pick<ToolInvokeParams, 'rootOwner' | 'conversationId' | 'userId' | 'assistantId'>
): FileOwnerRef => {
  const rootOwner = params.rootOwner
  if (rootOwner) {
    return {
      ownerType: rootOwner.type,
      ownerId: rootOwner.id,
    }
  }
  if (params.conversationId) {
    return {
      ownerType: 'CHAT',
      ownerId: params.conversationId,
    }
  }
  if (params.userId) {
    return {
      ownerType: 'USER',
      ownerId: params.userId,
    }
  }
  return {
    ownerType: 'ASSISTANT',
    ownerId: params.assistantId,
  }
}
