import {
  assistantFiles,
  assistantSharingData,
  assistantToolsEnablement,
  deleteAssistant,
  getAssistantVersion,
  setAssistantDeleted,
  updateAssistantCurrentVersion,
} from '@/models/assistant'
import { requireSession, SimpleSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { getUserWorkspaceMemberships } from '@/models/user'
import { canEditAssistant } from '@/lib/rbac'

export const dynamic = 'force-dynamic'

export const GET = requireSession(
  async (session: SimpleSession, req: Request, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const userId = session.userId
    const assistant = await getAssistantVersion(assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity(`There is no assistant with id ${assistantId}`)
    }
    const { imageId, ...assistantWithoutImage } = assistant
    const sharingData = await assistantSharingData(assistant.id)
    const workspaceMemberships = await getUserWorkspaceMemberships(userId)
    if (
      !canEditAssistant(
        { owner: assistant.owner ?? '', sharing: sharingData },
        session.userId,
        workspaceMemberships
      )
    ) {
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
    const assistant = await getAssistantVersion(assistantId)
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
      !canEditAssistant(
        { owner: assistant.owner ?? '', sharing: sharingData },
        session.userId,
        workspaceMemberships
      ) &&
      session.userRole != 'ADMIN'
    ) {
      return ApiResponses.notAuthorized(
        `You're not authorized to modify assistant ${params.assistantId}`
      )
    }
    const data = (await req.json()) as Partial<dto.InsertableAssistant>
    await updateAssistantCurrentVersion(params.assistantId, data)
    return ApiResponses.success()
  }
)

export const DELETE = requireSession(
  async (session: SimpleSession, req: Request, params: { assistantId: string }) => {
    const assistant = await getAssistantVersion(params.assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity(`There is no assistant with id ${params.assistantId}`)
    }
    if (assistant.provisioned) {
      return ApiResponses.forbiddenAction("Can't delete a provisioned assistant")
    }
    // Only owner and admin can delete an assistant
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
