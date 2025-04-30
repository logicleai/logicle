import {
  assistantFiles,
  assistantFilesWithPath,
  assistantSharingData,
  assistantToolsEnablement,
  deleteAssistant,
  getAssistant,
  setAssistantDeleted,
  updateAssistant,
} from '@/models/assistant'
import { requireSession, SimpleSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { getUserWorkspaceMemberships } from '@/models/user'
import { WorkspaceRole } from '@/types/workspace'

export const dynamic = 'force-dynamic'

const isSharedWithMe = (
  sharing: dto.Sharing[],
  workspaceMemberships: dto.WorkspaceMembership[]
) => {
  // A user can edit the assistant if:
  // - he is the owner
  // - he has the WorkspaceRole Editor role in the same workspace where the assistant has been shared
  //   (if the assistant has been shared to all it is editable only by the owner)
  return sharing.some((s) => {
    if (dto.isAllSharingType(s)) return false

    return workspaceMemberships.some((w) => {
      return (
        w.id == s.workspaceId &&
        (w.role == WorkspaceRole.EDITOR ||
          w.role == WorkspaceRole.OWNER ||
          w.role == WorkspaceRole.ADMIN)
      )
    })
  })
}

export const GET = requireSession(
  async (session: SimpleSession, req: Request, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const userId = session.userId
    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity(`There is no assistant with id ${assistantId}`)
    }
    const { imageId, ...assistantWithoutImage } = assistant
    const sharingData = await assistantSharingData(assistant.id)
    const workspaceMemberships = await getUserWorkspaceMemberships(userId)
    if (assistant.owner !== session.userId && !isSharedWithMe(sharingData, workspaceMemberships)) {
      return ApiResponses.notAuthorized(`You're not authorized to see assistant ${assistantId}`)
    }

    const assistantWithTools: dto.AssistantWithTools = {
      ...assistantWithoutImage,
      iconUri: assistant.imageId ? `/api/images/${assistant.imageId}` : null,
      tools: await assistantToolsEnablement(assistant.id),
      files: await assistantFiles(assistant.id),
      sharing: sharingData,
      tags: JSON.parse(assistant.tags),
      prompts: JSON.parse(assistant.prompts),
    }
    return ApiResponses.json(assistantWithTools)
  }
)

export const PATCH = requireSession(
  async (session: SimpleSession, req: Request, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const userId = session.userId
    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity(`There is no assistant with id ${params.assistantId}`)
    }
    if (assistant.provisioned) {
      return ApiResponses.forbiddenAction("Can't modify a provisioned assistant")
    }

    // Note: we need the admin to be able to modify the assistant owner
    // So... the API is a bit more open than reasonable
    const sharingData = await assistantSharingData(assistant.id)
    const workspaceMemberships = await getUserWorkspaceMemberships(userId)
    if (
      assistant.owner !== session.userId &&
      !isSharedWithMe(sharingData, workspaceMemberships) &&
      session.userRole != 'ADMIN'
    ) {
      return ApiResponses.notAuthorized(
        `You're not authorized to modify assistant ${params.assistantId}`
      )
    }
    const data = (await req.json()) as Partial<dto.InsertableAssistant>
    await updateAssistant(params.assistantId, data)
    return ApiResponses.success()
  }
)

export const DELETE = requireSession(
  async (session: SimpleSession, req: Request, params: { assistantId: string }) => {
    const assistant = await getAssistant(params.assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity(`There is no assistant with id ${params.assistantId}`)
    }
    if (assistant.provisioned) {
      return ApiResponses.forbiddenAction("Can't delete a provisioned assistant")
    }
    // Note: we need the admin to be able to modify the assistant owner
    // So... the API is a bit more open than reasonable
    if (assistant.owner !== session.userId && session.userRole != 'ADMIN') {
      return ApiResponses.notAuthorized(
        `You're not authorized to delete assistant ${params.assistantId}`
      )
    }
    try {
      // This will fail if the assistant has been used in some conversations
      await deleteAssistant(params.assistantId)
    } catch {
      await setAssistantDeleted(params.assistantId)
    }
    return ApiResponses.success()
  }
)
