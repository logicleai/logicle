import {
  assistantFiles,
  assistantToolsEnablement,
  createAssistant,
  getAssistant,
} from '@/models/assistant'
import { requireSession, SimpleSession } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import * as dto from '@/types/dto'
import { getImageAsDataUri } from '@/models/images'

export const dynamic = 'force-dynamic'

export const POST = requireSession(
  async (session: SimpleSession, req: Request, params: { assistantId: string }) => {
    const assistantId = params.assistantId
    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity(`There is no assistant with id ${assistantId}`)
    }
    if (assistant.owner !== session.userId) {
      return ApiResponses.notAuthorized(`You're not authorized to clone assistant ${assistantId}`)
    }
    if (assistant.provisioned) {
      return ApiResponses.notAuthorized(`Can't clone provisioned assistant ${assistantId}`)
    }

    const assistantWithTools: dto.InsertableAssistant = {
      ...assistant,
      name: 'Copy of' + ' ' + assistant.name,
      iconUri: assistant.imageId ? await getImageAsDataUri(assistant.imageId) : null,
      tools: await assistantToolsEnablement(assistant.id),
      files: await assistantFiles(assistant.id),
      prompts: JSON.parse(assistant.prompts),
      tags: JSON.parse(assistant.tags),
    }
    const created = await createAssistant({
      ...assistantWithTools,
      owner: session.userId,
    })
    return ApiResponses.created(created)
  }
)
