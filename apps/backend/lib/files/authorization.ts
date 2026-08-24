import { db } from '@/db/database'
import type * as schema from '@/db/schema'
import { canUserAccessAssistant } from '@/models/assistant'
import { canUserAccessTool } from '@/models/tool'

/**
 * File ownership and authorization model
 * ---------------------------------------
 * Every `File` row has an owner: `USER` (a person), `CHAT` (a conversation),
 * `ASSISTANT`, or `TOOL`. Read and write access are deliberately different
 * permissions, checked by different functions:
 *
 * | ownerType  | read (canAccess)                                    | write (canWriteFile)          |
 * |------------|------------------------------------------------------|--------------------------------|
 * | USER       | caller is the owner                                   | caller is the owner            |
 * | CHAT       | conversation owner, or anyone holding a share on it   | never (see below)               |
 * | ASSISTANT  | canUserAccessAssistant (owner, public/workspace share)| never (see below)               |
 * | TOOL       | public → anyone; workspace → member; private → admin  | never (see below)               |
 * | unowned (legacy, no ownerType/ownerId) | readable (permissive fallback) | never (no owner to check) |
 *
 * Uploads (`PUT /api/files/{id}/content`) only ever happen while a file is
 * still `USER`-owned: every upload flow creates the `File` row as `USER`-owned
 * first, uploads content, and only afterwards does the file get reassigned to
 * its final owner — server-side, as a side effect of saving the entity it's
 * attached to (`reassignUserOwnedFilesToConversation` on message send,
 * `transferFilesToAssistantOwner` on assistant draft save,
 * `transferFilesToToolOwner` on tool save). Because of that, `canWriteFile`
 * only ever needs to check `USER` ownership — a file is never re-uploaded to
 * once it belongs to a chat/assistant/tool. In particular, being able to
 * *read* a file via a conversation share, a public tool, or a shared
 * assistant must never imply being able to *write* it.
 */

type AccessUser = {
  userId: string
  userRole?: schema.UserRole
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
    case 'TOOL':
      return await canUserAccessTool(user, ownerId)
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

/** Uploads are only allowed while a newly-created file is still owned by its
 * creator. Ownership of the entity a file will end up attached to (a chat,
 * assistant, or tool) is established separately, server-side, once that
 * entity is actually saved with the file attached (see
 * reassignUserOwnedFilesToConversation, transferFilesToAssistantOwner,
 * transferFilesToToolOwner) — a file is never uploaded to while already
 * owned by one of those entities. Shared conversations, public tools, and
 * shared assistants grant read access only and must never grant mutation.
 */
export const canWriteFile = async (user: AccessUser, fileId: string): Promise<boolean> => {
  const file = await db
    .selectFrom('File')
    .select(['ownerType', 'ownerId'])
    .where('id', '=', fileId)
    .executeTakeFirst()
  return file?.ownerType === 'USER' && file.ownerId === user.userId
}
