import {
  assistantVersionFiles,
  assistantSharingData,
  assistantVersionEnabledTools,
  deleteAssistant,
  getAssistant,
  getAssistantVersion,
  setAssistantDeleted,
  updateAssistantDraft,
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
    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity(`There is no assistant with id ${assistantId}`)
    }
    if (!assistant.draftVersionId) {
      return ApiResponses.invalidParameter(`Assistant ${assistantId} has no draft version`)
    }
    const assistantVersion = await getAssistantVersion(assistant.draftVersionId)
    if (!assistantVersion) {
      return ApiResponses.noSuchEntity(`Assistant with id ${assistantId} has no draft version`)
    }
    const { imageId, ...assistantWithoutImage } = assistantVersion
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

    const AssistantDraft: dto.AssistantDraft = {
      ...assistantWithoutImage,
      owner: assistant.owner,
      provisioned: assistant.provisioned,
      iconUri: assistantVersion.imageId ? `/api/images/${assistantVersion.imageId}` : null,
      tools: await assistantVersionEnabledTools(assistantVersion.id),
      files: await assistantVersionFiles(assistantVersion.id),
      sharing: sharingData,
      tags: JSON.parse(assistantVersion.tags),
      prompts: JSON.parse(assistantVersion.prompts),
      pendingChanges: assistant.draftVersionId != assistant.publishedVersionId,
    }
    return ApiResponses.json(AssistantDraft)
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

    const sharingData = await assistantSharingData(assistant.id)
    const workspaceMemberships = await getUserWorkspaceMemberships(userId)
    if (
      !canEditAssistant(
        { owner: assistant.owner ?? '', sharing: sharingData },
        session.userId,
        workspaceMemberships
      )
    ) {
      return ApiResponses.notAuthorized(
        `You're not authorized to modify assistant ${params.assistantId}`
      )
    }
    const { pendingChanges, ...data } = await req.json()

    await updateAssistantDraft(params.assistantId, data)
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
