import { error, forbidden, notFound, ok, operation, responseSpec, route } from '@/lib/routes'
import * as dto from '@/types/dto'
import {
  assistantSharingData,
  assistantVersionEnabledTools,
  assistantVersionFiles,
  createAssistant,
  getAssistant,
  getAssistantVersion,
} from '@/models/assistant'
import { getImageAsDataUri } from '@/models/images'
import { getUserWorkspaceMemberships } from '@/models/user'
import { isSharedWithAllOrAnyWorkspace } from '@/types/dto'

export const dynamic = 'force-dynamic'

export const { POST } = route({
  POST: operation({
    name: 'Clone assistant',
    description: 'Clone a published assistant.',
    authentication: 'user',
    responses: [
      responseSpec(201),
      responseSpec(400),
      responseSpec(403),
      responseSpec(404),
    ] as const,
    implementation: async (_req: Request, params: { assistantId: string }, { session }) => {
      const assistantId = params.assistantId
      const assistant = await getAssistant(assistantId)
      if (!assistant) {
        return notFound(`There is no assistant with id ${assistantId}`)
      }
      if (assistant.provisioned) {
        return forbidden(`Can't clone provisioned assistant ${assistantId}`)
      }
      if (assistant.owner !== session.userId) {
        const enabledWorkspaces = (await getUserWorkspaceMemberships(session.userId)).map(
          (m) => m.id
        )
        const sharingData = await assistantSharingData(assistant.id)
        if (!isSharedWithAllOrAnyWorkspace(sharingData, enabledWorkspaces)) {
          return forbidden(`You're not authorized to clone assistant ${assistantId}`)
        }
      }
      if (!assistant.publishedVersionId) {
        return error(400, `Assistant ${assistantId} has never been published`)
      }
      const assistantVersion = await getAssistantVersion(assistant.publishedVersionId)
      if (!assistantVersion) {
        return forbidden(`Assistant is not published`)
      }

      const assistantDraft: dto.InsertableAssistantDraft = {
        ...assistantVersion,
        name: `Copy of ${assistantVersion.name}`,
        iconUri: assistantVersion.imageId
          ? await getImageAsDataUri(assistantVersion.imageId)
          : null,
        tools: await assistantVersionEnabledTools(assistantVersion.id),
        files: await assistantVersionFiles(assistantVersion.id),
        prompts: JSON.parse(assistantVersion.prompts),
        tags: JSON.parse(assistantVersion.tags),
      }
      const created = await createAssistant(assistantDraft, session.userId)
      return ok(created, 201)
    },
  }),
})
