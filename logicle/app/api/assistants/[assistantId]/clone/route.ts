import {
  assistantVersionFiles,
  assistantSharingData,
  assistantVersionToolsEnablement,
  createAssistant,
  getAssistantStatus,
  getAssistantVersion,
} from '@/models/assistant'
import { requireSession, SimpleSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { getImageAsDataUri } from '@/models/images'
import { getUserWorkspaceMemberships } from '@/models/user'
import { isSharedWithAllOrAnyWorkspace } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const POST = requireSession(
  async (session: SimpleSession, req: Request, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const assistant = await getAssistantStatus(assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity(`There is no assistant with id ${assistantId}`)
    }
    if (assistant.provisioned) {
      return ApiResponses.notAuthorized(`Can't clone provisioned assistant ${assistantId}`)
    }
    if (assistant.owner !== session.userId) {
      const enabledWorkspaces = (await getUserWorkspaceMemberships(session.userId)).map((m) => m.id)
      const sharingData = await assistantSharingData(assistant.id)
      if (!isSharedWithAllOrAnyWorkspace(sharingData, enabledWorkspaces)) {
        return ApiResponses.notAuthorized(`You're not authorized to clone assistant ${assistantId}`)
      }
    }
    const assistantVersion = await getAssistantVersion(assistant.publishedVersionId)
    if (!assistantVersion) {
      return ApiResponses.notAuthorized(`Assistant is not published`)
    }

    const AssistantDraft: dto.InsertableAssistant = {
      ...assistantVersion,
      name: 'Copy of' + ' ' + assistantVersion.name,
      iconUri: assistantVersion.imageId ? await getImageAsDataUri(assistantVersion.imageId) : null,
      tools: await assistantVersionToolsEnablement(assistantVersion.id),
      files: await assistantVersionFiles(assistantVersion.id),
      prompts: JSON.parse(assistantVersion.prompts),
      tags: JSON.parse(assistantVersion.tags),
    }
    const created = await createAssistant(AssistantDraft, session.userId)
    return ApiResponses.created(created)
  }
)
