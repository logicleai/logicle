import Assistants from 'models/assistant'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'
import { InsertableAssistantWithTools, SelectableAssistantWithTools } from '@/types/dto'
export const dynamic = 'force-dynamic'

export const GET = requireAdmin(
  async (req: Request, route: { params: { assistantId: string } }) => {
    const assistant = await Assistants.get(route.params.assistantId)
    if (!assistant) {
      return ApiResponses.noSuchEntity(`There is no assistant with id ${route.params.assistantId}`)
    }
    const AssistantWithTools: SelectableAssistantWithTools = {
      ...assistant,
      tools: await Assistants.toolsEnablement(assistant.id),
      files: await Assistants.files(assistant.id),
    }
    return ApiResponses.json(AssistantWithTools)
  }
)

export const PATCH = requireAdmin(
  async (req: Request, route: { params: { assistantId: string } }) => {
    const data = (await req.json()) as Partial<InsertableAssistantWithTools>
    await Assistants.update(route.params.assistantId, data)
    return ApiResponses.success()
  }
)

export const DELETE = requireAdmin(
  async (req: Request, route: { params: { assistantId: string } }) => {
    try {
      await Assistants.delete(route.params.assistantId) // Use the helper function
    } catch (e) {
      const interpretedException = interpretDbException(e)
      if (
        interpretedException instanceof KnownDbError &&
        interpretedException.code == KnownDbErrorCode.CANT_UPDATE_DELETE_FOREIGN_KEY
      ) {
        return ApiResponses.foreignKey('Assistant is in use')
      }
      return defaultErrorResponse(interpretedException)
    }
    return ApiResponses.success()
  }
)
