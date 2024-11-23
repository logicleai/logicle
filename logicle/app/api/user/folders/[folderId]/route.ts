import { deleteFolder, getFolder, updateFolder } from '@/models/folder'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { db } from '@/db/database'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import { Session } from 'next-auth'
import { NextRequest } from 'next/server'
import { getConversation } from '@/models/conversation'

export const dynamic = 'force-dynamic'

// Fetch folder
export const GET = requireSession(
  async (session: SimpleSession, _: NextRequest, params: { folderId: string }) => {
    const folder = await getFolder(params.folderId) // Use the helper function
    if (!folder) {
      return ApiResponses.noSuchEntity(
        `There is no folder with id ${params.folderId} for the session user`
      )
    }
    if (folder.ownerId != session.userId) {
      return ApiResponses.forbiddenAction()
    }
    return ApiResponses.json(folder)
  }
)

// Update folder
export const PATCH = requireSession(
  async (session: SimpleSession, req: NextRequest, params: { folderId: string }) => {
    const folderId = params.folderId
    const data = (await req.json()) as Partial<dto.ConversationFolder>
    const existingFolder = await getFolder(folderId) // Use the helper function
    if (!existingFolder) {
      return ApiResponses.noSuchEntity(
        `There is no folder with id ${folderId} for the session user`
      )
    }
    if (existingFolder.ownerId != session.userId) {
      return ApiResponses.forbiddenAction("Can't update a non-owned folder")
    }
    if (data.id != null && data.id != existingFolder.id) {
      return ApiResponses.invalidParameter("Can't change the id of the folder")
    }
    if (data.ownerId != null && data.ownerId != existingFolder.ownerId) {
      return ApiResponses.invalidParameter("Can't change the owner of the folder")
    }
    await updateFolder(folderId, data) // Use the helper function
    return ApiResponses.success()
  }
)

// Delete folder
export const DELETE = requireSession(
  async (session: SimpleSession, _: NextRequest, params: { folderId: string }) => {
    await deleteFolder(params.folderId, session.userId) // Use the helper function
    return ApiResponses.success()
  }
)

// Update folder
export const POST = requireSession(
  async (session: SimpleSession, req: NextRequest, params: { folderId: string }) => {
    const { conversationId } = (await req.json()) as {
      conversationId: string
    }
    const conversation = await getConversation(conversationId)
    if (conversation?.ownerId != session.userId) {
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
