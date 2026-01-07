import { db } from '@/db/database'
import { forbidden, notFound, ok, operation, responseSpec, route } from '@/lib/routes'
import { assistantsSharingData, getAssistant } from '@/models/assistant'
import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'

export const { POST } = route({
  POST: operation({
    name: 'Update assistant sharing',
    description: 'Update sharing configuration for an assistant.',
    authentication: 'user',
    requestBodySchema: dto.sharingSchema.array(),
    responses: [
      responseSpec(200, dto.sharingSchema.array()),
      responseSpec(403),
      responseSpec(404),
    ] as const,
    implementation: async (
      _req: Request,
      params: { assistantId: string },
      { session, requestBody }
    ) => {
      const assistantId = params.assistantId
      const assistant = await getAssistant(assistantId)
      if (!assistant) {
        return notFound(`There is no assistant with id ${assistantId}`)
      }
      if (assistant.owner !== session.userId) {
        return forbidden(`You're not authorized to modify assistant ${assistantId}`)
      }
      const currentSharingProvisioned = await db
        .selectFrom('AssistantSharing')
        .selectAll()
        .where('assistantId', '=', assistantId)
        .where('provisioned', '=', 1)
        .execute()
      if (currentSharingProvisioned.length !== 0) {
        return forbidden(`You're not authorized to modify provisioned sharing of ${assistantId}`)
      }
      const sharingList = requestBody
      await db.deleteFrom('AssistantSharing').where('assistantId', '=', assistantId).execute()
      if (sharingList.length !== 0) {
        await db
          .insertInto('AssistantSharing')
          .values(
            sharingList.map((sharing) => {
              return {
                id: nanoid(),
                assistantId: assistantId,
                workspaceId: sharing.type === 'workspace' ? sharing.workspaceId : null,
                provisioned: 0,
              }
            })
          )
          .execute()
      }

      const sharingData =
        (await assistantsSharingData([params.assistantId])).get(params.assistantId) || []
      return ok(sharingData)
    },
  }),
})
