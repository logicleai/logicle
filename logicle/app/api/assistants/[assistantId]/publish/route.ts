import { db } from '@/db/database'
import { error, notFound, ok, operation, responseSpec, route } from '@/lib/routes'
import { canEditAssistant } from '@/lib/rbac'
import { assistantSharingData, getAssistant } from '@/models/assistant'
import { getUserWorkspaceMemberships } from '@/models/user'

export const { POST } = route({
  POST: operation({
    name: 'Publish assistant',
    description: 'Publish an assistant draft.',
    authentication: 'user',
    responses: [responseSpec(200), responseSpec(401), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { assistantId: string }, { session }) => {
      const assistantId = params.assistantId
      const userId = session.userId
      const assistant = await getAssistant(assistantId)
      if (!assistant) {
        return notFound(`There is no assistant with id ${assistantId}`)
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
        return error(401, `You're not authorized to modify assistant ${params.assistantId}`)
      }
      await db
        .updateTable('Assistant')
        .set(({ ref }) => ({
          publishedVersionId: ref('draftVersionId'),
        }))
        .where('Assistant.id', '=', assistantId)
        .execute()
      return ok({})
    },
  }),
})
