import Assistants from 'models/assistant'
import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'
import {
  AssistantToolAssociation,
  InsertableAssistantWithTools,
  SelectableAssistantWithTools,
} from '@/types/db'
import { db } from '@/db/database'
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
    }
    return ApiResponses.json(AssistantWithTools)
  }
)

export const PATCH = requireAdmin(
  async (req: Request, route: { params: { assistantId: string } }) => {
    const data = (await req.json()) as Partial<InsertableAssistantWithTools>
    const tools = data.tools
    if (tools) {
      // TODO: delete and insert is not that elegant...
      // but I'm lazy
      await db
        .deleteFrom('AssistantToolAssociation')
        .where('assistantId', '=', route.params.assistantId)
        .execute()
      const toInsert: AssistantToolAssociation[] = tools
        .filter((p) => p.enabled)
        .map((p) => {
          return {
            assistantId: route.params.assistantId,
            toolId: p.id,
          }
        })
      if (toInsert.length != 0) {
        await db.insertInto('AssistantToolAssociation').values(toInsert).execute()
      }
    }
    data['id'] = undefined
    data['tools'] = undefined
    await Assistants.update(route.params.assistantId, data) // Use the helper function
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
