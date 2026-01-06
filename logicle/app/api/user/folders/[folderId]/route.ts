import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
import { route, operation } from '@/lib/routes'
import { getConversation } from '@/models/conversation'
import { deleteFolder, getFolder, updateFolder } from '@/models/folder'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

export const { GET, PATCH, DELETE, POST } = route({
  GET: operation({
    name: 'Get folder',
    description: 'Fetch a folder for the current user.',
    authentication: 'user',
    responseBodySchema: dto.conversationFolderSchema,
    implementation: async (_req: Request, params: { folderId: string }, { session }) => {
      const folder = await getFolder(params.folderId)
      if (!folder) {
        return ApiResponses.noSuchEntity(
          `There is no folder with id ${params.folderId} for the session user`
        )
      }
      if (folder.ownerId !== session.userId) {
        return ApiResponses.forbiddenAction()
      }
      return folder
    },
  }),
  PATCH: operation({
    name: 'Update folder',
    description: 'Update a folder for the current user.',
    authentication: 'user',
    requestBodySchema: dto.updateableConversationFolderSchema,
    implementation: async (
      _req: Request,
      params: { folderId: string },
      { session, requestBody }
    ) => {
      const folderId = params.folderId
      const data = requestBody
      const existingFolder = await getFolder(folderId)
      if (!existingFolder) {
        return ApiResponses.noSuchEntity(
          `There is no folder with id ${folderId} for the session user`
        )
      }
      if (existingFolder.ownerId !== session.userId) {
        return ApiResponses.forbiddenAction("Can't update a non-owned folder")
      }
      await updateFolder(folderId, data)
      return ApiResponses.success()
    },
  }),
  DELETE: operation({
    name: 'Delete folder',
    description: 'Delete a folder for the current user.',
    authentication: 'user',
    implementation: async (_req: Request, params: { folderId: string }, { session }) => {
      await deleteFolder(params.folderId, session.userId)
      return ApiResponses.success()
    },
  }),
  POST: operation({
    name: 'Add conversation to folder',
    description: 'Add or move a conversation into a folder.',
    authentication: 'user',
    requestBodySchema: dto.addConversationToFolderSchema,
    implementation: async (
      _req: Request,
      params: { folderId: string },
      { session, requestBody }
    ) => {
      const { conversationId } = requestBody
      const conversation = await getConversation(conversationId)
      if (conversation?.ownerId !== session.userId) {
        return ApiResponses.notAuthorized("Can't add a non-owned conversation to a folder")
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
      return ApiResponses.success()
    },
  }),
})
