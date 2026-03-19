import { db } from '@/db/database'
import { forbidden, noBody, notFound, ok, operation, responseSpec, errorSpec } from '@/lib/routes'
import { getConversation } from '@/models/conversation'
import { deleteFolder, getFolder, updateFolder } from '@/models/folder'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'Get folder',
  description: 'Fetch a folder for the current user.',
  authentication: 'user',
  responses: [
    responseSpec(200, dto.conversationFolderSchema),
    errorSpec(403),
    errorSpec(404),
  ] as const,
  implementation: async ({ params, session }) => {
    const folder = await getFolder(params.folderId)
    if (!folder) {
      return notFound(`There is no folder with id ${params.folderId} for the session user`)
    }
    if (folder.ownerId !== session.userId) {
      return forbidden()
    }
    return ok(folder)
  },
})

export const PATCH = operation({
  name: 'Update folder',
  description: 'Update a folder for the current user.',
  authentication: 'user',
  requestBodySchema: dto.updateableConversationFolderSchema,
  responses: [responseSpec(204), errorSpec(403), errorSpec(404)] as const,
  implementation: async ({ params, session, requestBody }) => {
    const folderId = params.folderId
    const data = requestBody
    const existingFolder = await getFolder(folderId)
    if (!existingFolder) {
      return notFound(`There is no folder with id ${folderId} for the session user`)
    }
    if (existingFolder.ownerId !== session.userId) {
      return forbidden("Can't update a non-owned folder")
    }
    await updateFolder(folderId, data)
    return noBody()
  },
})

export const DELETE = operation({
  name: 'Delete folder',
  description: 'Delete a folder for the current user.',
  authentication: 'user',
  responses: [responseSpec(204)] as const,
  implementation: async ({ params, session }) => {
    await deleteFolder(params.folderId, session.userId)
    return noBody()
  },
})

export const POST = operation({
  name: 'Add conversation to folder',
  description: 'Add or move a conversation into a folder.',
  authentication: 'user',
  requestBodySchema: dto.addConversationToFolderSchema,
  responses: [responseSpec(204), errorSpec(403)] as const,
  implementation: async ({ params, session, requestBody }) => {
    const { conversationId } = requestBody
    const conversation = await getConversation(conversationId)
    if (conversation?.ownerId !== session.userId) {
      return forbidden("Can't add a non-owned conversation to a folder")
    }
    await db
      .insertInto('ConversationFolderMembership')
      .values({
        folderId: params.folderId,
        conversationId: conversationId,
      })
      .onConflict((oc) =>
        oc.columns(['conversationId']).doUpdateSet({
          folderId: params.folderId,
        })
      )
      .executeTakeFirstOrThrow()
    return noBody()
  },
})
