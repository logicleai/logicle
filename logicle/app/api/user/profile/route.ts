import {
  getUserById,
  getUserParameterValuesAsRecord,
  getUserWorkspaceMemberships,
  setUserParameterValues,
  updateUser,
} from '@/models/user'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireSession } from '../../utils/auth'
import { getUserAssistants } from '@/models/assistant'
import { WorkspaceRole } from '@/types/workspace'
import { Updateable } from 'kysely'
import * as schema from '@/db/schema'
import { getOrCreateImageFromDataUri } from '@/models/images'
import * as dto from '@/types/dto'
import { getMostRecentConversation } from '@/models/conversation'

export const dynamic = 'force-dynamic'

export const GET = requireSession(async (session) => {
  const user = await getUserById(session.userId)
  if (!user) {
    return ApiResponses.noSuchEntity('Unknown session user')
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
    // In previous versions we were not tracking assistant usage, so.. let's get the assistant from the chats
    const lastChat = await getMostRecentConversation(session.userId)
    lastUsedAssistant = userAssistants.find((a) => a.id === lastChat?.assistantId) ?? null
  }

  if (lastUsedAssistant == null) {
    // Nothing yet... get it from pinned assistant
    lastUsedAssistant = pinnedAssistants[0] ?? null
  }

  if (lastUsedAssistant == null) {
    // Just take the first one
    lastUsedAssistant = userAssistants[0] ?? null
  }

  const userDTO: dto.UserProfile = {
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
    role: user.role,
  }
  return ApiResponses.json(userDTO)
})

export const PATCH = requireSession(async (session, req) => {
  const result = dto.updateableUserSelfSchema.safeParse(await req.json())
  if (!result.success) {
    return ApiResponses.invalidParameter('Invalid body', result.error.format())
  }
  const sanitizedUser = result.data

  const { image, properties, ...sanitizedUserWithoutImage } = sanitizedUser
  // extract the image field, we will handle it separately, and discard unwanted fields
  const imageId = image ? await getOrCreateImageFromDataUri(image) : null
  const dbUser: Updateable<schema.User> = {
    ...sanitizedUserWithoutImage,
    preferences: sanitizedUser.preferences ? JSON.stringify(sanitizedUser.preferences) : undefined,
    imageId,
  }

  // delete the old image
  await updateUser(session.userId, dbUser)
  if (properties) {
    await setUserParameterValues(session.userId, properties)
  }
  return ApiResponses.success()
})
