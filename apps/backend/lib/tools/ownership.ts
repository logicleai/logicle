import type { FileOwnerRef } from '@/backend/lib/files/materialize'
import type { ToolInvokeParams } from '@/lib/chat/tools'

export const resolveFileOwner = (
  params: Pick<ToolInvokeParams, 'rootOwner' | 'conversationId' | 'userId' | 'assistantId'>,
  displayName: string
): FileOwnerRef => {
  const rootOwner = params.rootOwner
  if (rootOwner) {
    return {
      ownerType: rootOwner.type,
      ownerId: rootOwner.id,
      displayName,
    }
  }
  if (params.conversationId) {
    return {
      ownerType: 'CHAT',
      ownerId: params.conversationId,
      displayName,
    }
  }
  if (params.userId) {
    return {
      ownerType: 'USER',
      ownerId: params.userId,
      displayName,
    }
  }
  return {
    ownerType: 'ASSISTANT',
    ownerId: params.assistantId,
    displayName,
  }
}
