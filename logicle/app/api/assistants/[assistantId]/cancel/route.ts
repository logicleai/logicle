import { db } from '@/db/database'
import { error, forbidden, notFound, ok, operation, responseSpec, route } from '@/lib/routes'
import { canEditAssistant } from '@/lib/rbac'
import {
  assistantSharingData,
  getAssistant,
  getAssistantDraft,
  getAssistantVersion,
} from '@/models/assistant'
import { getUserWorkspaceMemberships } from '@/models/user'
import * as dto from '@/types/dto'

export const { POST } = route({
  POST: operation({
    name: 'Reset assistant draft',
    description: 'Reset draft to the last published version.',
    authentication: 'user',
    responses: [responseSpec(200, dto.assistantDraftSchema), responseSpec(403), responseSpec(404)] as const,
    implementation: async (_req: Request, params: { assistantId: string }, { session }) => {
      const assistantId = params.assistantId
      const userId = session.userId
      const assistant = await getAssistant(assistantId)
      if (!assistant) {
        return notFound(`There is no assistant with id ${assistantId}`)
      }
      if (!assistant.publishedVersionId) {
        return notFound(`assistant with id ${assistantId} is not published`)
      }
      const assistantVersion = await getAssistantVersion(assistant.publishedVersionId)
      if (!assistantVersion) {
        return notFound(`Can't find published assistant version`)
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
        return forbidden(`You're not authorized to modify assistant ${params.assistantId}`)
      }
      await db
        .updateTable('Assistant')
        .set({ draftVersionId: assistant.publishedVersionId })
        .where('Assistant.id', '=', assistantId)
        .execute()

      const assistantPatched = {
        ...assistant,
        draftVersionId: assistant.publishedVersionId,
      }

      return ok(await getAssistantDraft(assistantPatched, assistantVersion, sharingData))
    },
  }),
})
