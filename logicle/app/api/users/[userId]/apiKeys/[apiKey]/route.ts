import { requireAdmin } from '@/api/utils/auth'
import ApiResponses from '@/api/utils/ApiResponses'
import { deleteApiKey, getUserApiKey } from '@/models/apikey'
import {
  defaultErrorResponse,
  interpretDbException,
  KnownDbError,
  KnownDbErrorCode,
} from '@/db/exception'

export const DELETE = requireAdmin(
  async (_req: Request, params: { userId: string; apiKey: string }) => {
    const apiKey = await getUserApiKey(params.userId, params.apiKey)
    if (!apiKey) {
      return ApiResponses.noSuchEntity(
        `There is no api key with id ${params.apiKey} for user ${params.userId}`
      )
    }
    if (apiKey.provisioned) {
      return ApiResponses.forbiddenAction("Can't delete a provisioned api key")
    }

    try {
      const result = await deleteApiKey(params.userId, params.apiKey)
      if (result[0].numDeletedRows.toString() != '1') {
        return ApiResponses.noSuchEntity(
          `No such api key ${params.apiKey} for user ${params.userId}`
        )
      }
    } catch (e) {
      const interpretedException = interpretDbException(e)
      if (
        interpretedException instanceof KnownDbError &&
        interpretedException.code == KnownDbErrorCode.CONSTRAINT_FOREIGN_KEY
      ) {
        return ApiResponses.foreignKey('User has some activitity which is not deletable')
      }
      return defaultErrorResponse(interpretedException)
    }
    return ApiResponses.success()
  }
)
