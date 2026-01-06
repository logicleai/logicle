import ApiResponses from '@/api/utils/ApiResponses'
import { db } from '@/db/database'
import { route, operation } from '@/lib/routes'
import { getAssistant } from '@/models/assistant'
import { assistantOwnerSchema } from '@/types/dto/assistant'

export const dynamic = 'force-dynamic'

export const { PUT } = route({
  PUT: operation({
    name: 'Set assistant owner',
    description: 'Change assistant ownership.',
    authentication: 'admin',
    requestBodySchema: assistantOwnerSchema,
    implementation: async (_req: Request, params: { assistantId: string }, { requestBody }) => {
      const assistantId = params.assistantId
      const assistant = await getAssistant(assistantId)
      if (!assistant) {
        return ApiResponses.noSuchEntity(`There is no assistant with id ${params.assistantId}`)
      }
      if (assistant.provisioned) {
        return ApiResponses.forbiddenAction("Can't modify a provisioned assistant")
      }
      await db
        .updateTable('Assistant')
        .set({
          owner: requestBody,
        })
        .where('id', '=', assistantId)
        .execute()
      return ApiResponses.success()
    },
  }),
})
