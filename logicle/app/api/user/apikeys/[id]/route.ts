import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession, SimpleSession } from '@/app/api/utils/auth'
import { deleteApiKey, getApiKey } from '@/models/apikey'
import { defaultErrorResponse, interpretDbException } from '@/db/exception'

export const dynamic = 'force-dynamic'

export const DELETE = requireSession(
  async (session: SimpleSession, _req: Request, params: { id: string }) => {
    const existingApiKey = await getApiKey(params.id)
    if (!existingApiKey) {
      return ApiResponses.noSuchEntity('No such API key')
    }
    if (existingApiKey.provisioned) {
      return ApiResponses.forbiddenAction("Can't delete a provisioned tool")
    }
    if (existingApiKey.userId !== session.userId) {
      return ApiResponses.forbiddenAction("Can't delete a non owned api key")
    }
    try {
      await deleteApiKey(session.userId, params.id)
    } catch (e) {
      const interpretedException = interpretDbException(e)
      return defaultErrorResponse(interpretedException)
    }
    return ApiResponses.success()
  }
)
