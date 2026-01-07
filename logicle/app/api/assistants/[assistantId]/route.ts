import {
  conflict,
  error,
  forbidden,
  noBody,
  notFound,
  ok,
  operation,
  responseSpec,
  route,
} from '@/lib/routes'
import { canEditAssistant } from '@/lib/rbac'
import {
  assistantSharingData,
  deleteAssistant,
  getAssistant,
  getAssistantDraft,
  getAssistantVersion,
  setAssistantDeleted,
  updateAssistantDraft,
} from '@/models/assistant'
import { getUserWorkspaceMemberships } from '@/models/user'
import { assistantDraftSchema, updateableAssistantDraftSchema } from '@/types/dto/assistant'

export const dynamic = 'force-dynamic'

export const { GET, PATCH, DELETE } = route({
  GET: operation({
    name: 'Get assistant draft',
    description: 'Fetch assistant draft details.',
    authentication: 'user',
    responses: [
      responseSpec(200, assistantDraftSchema),
      responseSpec(400),
      responseSpec(403),
      responseSpec(404),
    ] as const,
    implementation: async (_req: Request, params: { assistantId: string }, { session }) => {
      const assistantId = params.assistantId
      const userId = session.userId
      const assistant = await getAssistant(assistantId)
      if (!assistant) {
        return notFound(`There is no assistant with id ${assistantId}`)
      }
      if (!assistant.draftVersionId) {
        return error(400, `Assistant ${assistantId} has no draft version`)
      }
      const assistantVersion = await getAssistantVersion(assistant.draftVersionId)
      if (!assistantVersion) {
        return notFound(`Assistant with id ${assistantId} has no draft version`)
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
        return forbidden(`You're not authorized to see assistant ${assistantId}`)
      }
      return ok(await getAssistantDraft(assistant, assistantVersion, sharingData))
    },
  }),
  PATCH: operation({
    name: 'Update assistant draft',
    description: 'Update assistant draft data.',
    authentication: 'user',
    requestBodySchema: updateableAssistantDraftSchema,
    responses: [responseSpec(204), responseSpec(403), responseSpec(404)] as const,
    implementation: async (
      _req: Request,
      params: { assistantId: string },
      { session, requestBody }
    ) => {
      const assistantId = params.assistantId
      const userId = session.userId
      const assistant = await getAssistant(assistantId)
      if (!assistant) {
        return notFound(`There is no assistant with id ${params.assistantId}`)
      }
      if (assistant.provisioned) {
        return forbidden("Can't modify a provisioned assistant")
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
      await updateAssistantDraft(params.assistantId, requestBody)
      return noBody()
    },
  }),
  DELETE: operation({
    name: 'Delete assistant',
    description: 'Delete an assistant.',
    authentication: 'user',
    responses: [
      responseSpec(204),
      responseSpec(401),
      responseSpec(403),
      responseSpec(404),
    ] as const,
    implementation: async (_req: Request, params: { assistantId: string }, { session }) => {
      const assistant = await getAssistant(params.assistantId)
      if (!assistant) {
        return notFound(`There is no assistant with id ${params.assistantId}`)
      }
      if (assistant.provisioned) {
        return forbidden("Can't delete a provisioned assistant")
      }
      // Only owner and admin can delete an assistant
      if (assistant.owner !== session.userId && session.userRole !== 'ADMIN') {
        return forbidden(`You're not authorized to delete assistant ${params.assistantId}`)
      }
      try {
        // This will fail if the assistant has been used in some conversations
        await deleteAssistant(params.assistantId)
      } catch {
        await setAssistantDeleted(params.assistantId)
      }
      return noBody()
    },
  }),
})
