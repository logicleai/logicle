import { db } from '@/db/database'
import { forbidden, noBody, notFound, operation, responseSpec, route } from '@/lib/routes'
import { getAssistant } from '@/models/assistant'
import { assistantOwnerSchema } from '@/types/dto/assistant'

export const dynamic = 'force-dynamic'

export const { PUT } = route({
  PUT: operation({
    name: 'Set assistant owner',
    description: 'Change assistant ownership.',
    authentication: 'admin',
    requestBodySchema: assistantOwnerSchema,
    responses: [responseSpec(204), responseSpec(403), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { assistantId: string }, { requestBody }) => {
      const assistantId = params.assistantId
      const assistant = await getAssistant(assistantId)
      if (!assistant) {
        return notFound(`There is no assistant with id ${params.assistantId}`)
      }
      if (assistant.provisioned) {
        return forbidden("Can't modify a provisioned assistant")
      }
      await db
        .updateTable('Assistant')
        .set({
          owner: requestBody,
        })
        .where('id', '=', assistantId)
        .execute()
      return noBody()
    },
  }),
})
