import { db } from '@/db/database'
import type * as schema from '@/db/schema'
import { canUserAccessAssistant } from '@/models/assistant'
import { getUserWorkspaceMemberships } from '@/models/user'

type AccessUser =
  | string
  | {
      id?: string
      role?: string
      userId?: string
      userRole?: string
    }
  | null
  | undefined

const normalizeUser = (user: AccessUser): { id: string; role?: string } | null => {
  if (!user) return null
  if (typeof user === 'string') {
    const id = user.trim()
    return id ? { id } : null
  }

  const id = (user.userId ?? user.id ?? '').trim()
  if (!id) return null

  const role = user.userRole ?? user.role
  return role ? { id, role } : { id }
}

const isAdminUser = async (userId: string, roleHint?: string): Promise<boolean> => {
  if (roleHint) {
    return roleHint === 'ADMIN'
  }

  const row = await db.selectFrom('User').select('role').where('id', '=', userId).executeTakeFirst()
  return row?.role === 'ADMIN'
}

export const canAccess = async (
  user: AccessUser,
  ownerType: schema.FileOwnerType,
  ownerId: string
): Promise<boolean> => {
  const normalizedUser = normalizeUser(user)
  if (!normalizedUser) {
    return false
  }

  switch (ownerType) {
    case 'USER':
      return normalizedUser.id === ownerId
    case 'CHAT': {
      const conversation = await db
        .selectFrom('Conversation')
        .select('ownerId')
        .where('id', '=', ownerId)
        .executeTakeFirst()
      if (conversation?.ownerId === normalizedUser.id) return true
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
      return await canUserAccessAssistant(normalizedUser.id, ownerId)
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
        const memberships = await getUserWorkspaceMemberships(normalizedUser.id)
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

      return await isAdminUser(normalizedUser.id, normalizedUser.role)
    }
  }
}

export const canAccessFile = async (user: AccessUser, fileId: string): Promise<boolean> => {
  const ownershipRows = await db
    .selectFrom('FileOwnership')
    .select(['ownerType', 'ownerId'])
    .where('fileId', '=', fileId)
    .execute()

  if (ownershipRows.length === 0) {
    // Legacy migration window behavior: unowned files stay readable.
    return true
  }

  for (const row of ownershipRows) {
    if (await canAccess(user, row.ownerType, row.ownerId)) {
      return true
    }
  }
  return false
}
