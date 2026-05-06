import { forbidden, noBody, notFound, operation, responseSpec, errorSpec } from '@/lib/routes'
import { canEditAssistant } from '@/lib/rbac'
import { assistantSharingData, getAssistant, updateAssistantHidden } from '@/models/assistant'
import { getUserWorkspaceMemberships } from '@/models/user'
import { updateableAssistantVisibilitySchema } from '@/types/dto/assistant'

export const PATCH = operation({
  name: 'Update assistant visibility',
  description: 'Update whether an assistant is hidden from the main assistant picker.',
  authentication: 'user',
  requestBodySchema: updateableAssistantVisibilitySchema,
  responses: [responseSpec(204), errorSpec(403), errorSpec(404)] as const,
  implementation: async ({ params, session, body }) => {
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
      return forbidden(`You're not authorized to modify assistant ${assistantId}`)
    }

    await updateAssistantHidden(assistantId, body.hidden)
    return noBody()
  },
})
