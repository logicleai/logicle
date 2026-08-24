import { forbidden, notFound, ok, operation, responseSpec, errorSpec } from '@/lib/routes'
import { canEditAssistant } from '@/lib/rbac'
import { assistantSharingData, getAssistant, getAssistantVersions } from '@/models/assistant'
import { getUserWorkspaceMemberships } from '@/models/user'
import { assistantVersionSchema } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'List assistant versions',
  description: 'Fetch version history for an assistant.',
  authentication: 'user',
  responses: [
    responseSpec(200, assistantVersionSchema.array()),
    errorSpec(403),
    errorSpec(404),
  ] as const,
  implementation: async ({ params, session }) => {
    const assistantId = params.assistantId
    const assistant = await getAssistant(assistantId)
    if (!assistant) {
      return notFound(`There is no assistant with id ${assistantId}`)
    }
    const sharingData = await assistantSharingData(assistant.id)
    const workspaceMemberships = await getUserWorkspaceMemberships(session.userId)
    if (
      !canEditAssistant(
        { owner: assistant.owner ?? '', sharing: sharingData },
        session.userId,
        workspaceMemberships
      )
    ) {
      return forbidden(`You're not authorized to see the history of assistant ${assistantId}`)
    }
    const versions = await getAssistantVersions(assistantId)
    return ok(versions)
  },
})
