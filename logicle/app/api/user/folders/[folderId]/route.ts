import { deleteFolder, getFolder, updateFolder } from '@/models/folder'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { db } from '@/db/database'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import { NextRequest } from 'next/server'
import { getConversation } from '@/models/conversation'

export const dynamic = 'force-dynamic'

// Fetch folder
export const GET = requireSession(
  async (session: SimpleSession, _: NextRequest, params: { folderId: string }) => {
    const folder = await getFolder(params.folderId)
    if (!folder) {
      return ApiResponses.noSuchEntity(
        `There is no folder with id ${params.folderId} for the session user`
      )
    }
    if (folder.ownerId !== session.userId) {
      return ApiResponses.forbiddenAction()
    }
    return ApiResponses.json(folder)
  }
)

// Update folder
export const PATCH = requireSession(
  async (session: SimpleSession, req: NextRequest, params: { folderId: string }) => {
    const folderId = params.folderId
    const result = dto.updateableConversationFolderSchema.safeParse(await req.json())
    if (!result.success) {
      return ApiResponses.invalidParameter('Invalid body', result.error.format())
    }
    const data = result.data
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
  }
)

// Delete folder
export const DELETE = requireSession(
  async (session: SimpleSession, _: NextRequest, params: { folderId: string }) => {
    await deleteFolder(params.folderId, session.userId)
    return ApiResponses.success()
  }
)

// Add conversation to folder
export const POST = requireSession(
  async (session: SimpleSession, req: NextRequest, params: { folderId: string }) => {
    const result = dto.addConversationToFolderSchema.safeParse(await req.json())
    if (!result.success) {
      return ApiResponses.invalidParameter('Invalid body', result.error.format())
    }
    const { conversationId } = result.data
    const conversation = await getConversation(conversationId)
    if (conversation?.ownerId !== session.userId) {
      return ApiResponses.notAuthorized("Can't add a non-owned conversation to a folder")
    }
    // TODO: check conversation / folder source / folder dest owner
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
  }
)
