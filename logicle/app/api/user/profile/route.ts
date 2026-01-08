import {
  getUserById,
  getUserParameterValuesAsRecord,
  getUserWorkspaceMemberships,
  setUserParameterValues,
  updateUser,
} from '@/models/user'
import { getUserAssistants } from '@/models/assistant'
import { getMostRecentConversation } from '@/models/conversation'
import { noBody, notFound, ok, operation, responseSpec, errorSpec, route } from '@/lib/routes'
import { getOrCreateImageFromDataUri } from '@/models/images'
import * as schema from '@/db/schema'
import * as dto from '@/types/dto'
import { WorkspaceRole } from '@/types/workspace'
import { Updateable } from 'kysely'
import { userProfileSchema } from '@/types/dto/user'

export const dynamic = 'force-dynamic'

export const { GET, PATCH } = route({
  GET: operation({
    name: 'Get user profile',
    description: 'Fetch the current user profile.',
    authentication: 'user',
    responses: [responseSpec(200, userProfileSchema), errorSpec(404)] as const,
    implementation: async (_req: Request, _params, { session }) => {
      const user = await getUserById(session.userId)
      if (!user) {
        return notFound('Unknown session user')
      }
      const enabledWorkspaces = await getUserWorkspaceMemberships(session.userId)
      const userAssistants = await getUserAssistants(
        {
          userId: session.userId,
        },
        'published'
      )
      const parameters = await getUserParameterValuesAsRecord(session.userId)

      const { password, ...userWithoutPassword } = user

      let lastUsedAssistant = userAssistants
        .filter((a) => a.lastUsed)
        .reduce(
          (best, a) => (!best || a.lastUsed! > best.lastUsed! ? a : best),
          null as dto.UserAssistant | null
        )

      const pinnedAssistants = userAssistants.filter((a) => a.pinned)

      if (lastUsedAssistant == null) {
        const lastChat = await getMostRecentConversation(session.userId)
        lastUsedAssistant = userAssistants.find((a) => a.id === lastChat?.assistantId) ?? null
      }

      if (lastUsedAssistant == null) {
        lastUsedAssistant = pinnedAssistants[0] ?? null
      }

      if (lastUsedAssistant == null) {
        lastUsedAssistant = userAssistants[0] ?? null
      }

      return ok({
        ...userWithoutPassword,
        image: user.imageId ? `/api/images/${user.imageId}` : null,
        workspaces: enabledWorkspaces.map((w) => {
          return {
            id: w.id,
            name: w.name,
            role: w.role as WorkspaceRole,
          }
        }),
        lastUsedAssistant: lastUsedAssistant,
        pinnedAssistants,
        preferences: JSON.parse(user.preferences),
        properties: parameters,
        ssoUser: user.ssoUser !== 0,
        provisioned: !!user.provisioned,
        role: user.role,
      } as dto.UserProfile)
    },
  }),
  PATCH: operation({
    name: 'Update user profile',
    description: 'Update the current user profile.',
    authentication: 'user',
    requestBodySchema: dto.updateableUserSelfSchema,
    responses: [responseSpec(204)] as const,
    implementation: async (_req: Request, _params, { session, requestBody }) => {
      const sanitizedUser = requestBody

      const { image, properties, ...sanitizedUserWithoutImage } = sanitizedUser
      const imageId = image ? await getOrCreateImageFromDataUri(image) : null
      const dbUser: Updateable<schema.User> = {
        ...sanitizedUserWithoutImage,
        preferences: sanitizedUser.preferences
          ? JSON.stringify(sanitizedUser.preferences)
          : undefined,
        imageId,
      }

      await updateUser(session.userId, dbUser)
      if (properties) {
        const stringProperties = Object.fromEntries(
          Object.entries(properties).map(([k, v]) => [k, String(v)])
        ) as Record<string, string>
        await setUserParameterValues(session.userId, stringProperties)
      }
      return noBody()
    },
  }),
})
