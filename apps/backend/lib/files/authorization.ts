import { db } from '@/db/database'
import type * as schema from '@/db/schema'
import { canUserAccessAssistant } from '@/models/assistant'
import { getUserWorkspaceMemberships } from '@/models/user'

type AccessUser = {
  userId: string
  userRole?: string
}

const isAdminUser = async (userId: string, userRoleHint?: string): Promise<boolean> => {
  if (userRoleHint) {
    return userRoleHint === 'ADMIN'
  }

  const row = await db.selectFrom('User').select('role').where('id', '=', userId).executeTakeFirst()
  return row?.role === 'ADMIN'
}

export const canAccess = async (
  user: AccessUser,
  ownerType: schema.FileOwnerType,
  ownerId: string
): Promise<boolean> => {
  const userId = user.userId

  switch (ownerType) {
    case 'USER':
      return userId === ownerId
    case 'CHAT': {
      const conversation = await db
        .selectFrom('Conversation')
        .select('ownerId')
        .where('id', '=', ownerId)
        .executeTakeFirst()
      if (conversation?.ownerId === userId) return true
      // Any authenticated user can access files from a shared conversation.
      const share = await db
        .selectFrom('ConversationSharing')
        .innerJoin('Message', (join) =>
          join.onRef('Message.id', '=', 'ConversationSharing.lastMessageId')
        )
        .where('Message.conversationId', '=', ownerId)
        .select('ConversationSharing.id')
        .executeTakeFirst()
      return !!share
    }
    case 'ASSISTANT':
      return await canUserAccessAssistant(userId, ownerId)
    case 'TOOL': {
      const tool = await db
        .selectFrom('Tool')
        .select('sharing')
        .where('id', '=', ownerId)
        .executeTakeFirst()
      if (!tool) {
        return false
      }

      if (tool.sharing === 'public') {
        return true
      }

      if (tool.sharing === 'workspace') {
        const memberships = await getUserWorkspaceMemberships(userId)
        if (memberships.length === 0) {
          return false
        }
        const workspaceIds = memberships.map((m) => m.id)
        const shared = await db
          .selectFrom('ToolSharing')
          .select('id')
          .where('toolId', '=', ownerId)
          .where('workspaceId', 'in', workspaceIds)
          .executeTakeFirst()
        return !!shared
      }

      return await isAdminUser(userId, user.userRole)
    }
  }
}

export const canAccessFile = async (user: AccessUser, fileId: string): Promise<boolean> => {
  const file = await db
    .selectFrom('File')
    .select(['ownerType', 'ownerId'])
    .where('id', '=', fileId)
    .executeTakeFirst()

  if (!file) {
    return false
  }
  if (!file.ownerType || !file.ownerId) {
    // Legacy migration window behavior: unowned files stay readable.
    return true
  }
  return await canAccess(user, file.ownerType, file.ownerId)
}
