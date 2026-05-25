import { forbidden, notFound, ok, operation, responseSpec, errorSpec } from '@/lib/routes'
import { canEditAssistant } from '@/lib/rbac'
import {
  assistantSharingData,
  getAssistant,
  getAssistantParentAssistants,
} from '@/models/assistant'
import { getUserWorkspaceMemberships } from '@/models/user'
import { assistantParentSchema } from '@/types/dto/assistant'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

export const GET = operation({
  name: 'Get assistant usage',
  description: 'Return the list of assistants that use this assistant as a sub-assistant.',
  authentication: 'user',
  responses: [
    responseSpec(200, z.array(assistantParentSchema)),
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
      return forbidden(`You're not authorized to see assistant ${assistantId}`)
    }
    const parents = await getAssistantParentAssistants(assistantId)
    return ok(parents)
  },
})
