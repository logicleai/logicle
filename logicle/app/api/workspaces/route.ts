import { slugify } from '@/lib/common'
import { createWorkspace, getWorkspaces } from '@/models/workspace'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireAdmin } from '@/api/utils/auth'
import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'
import { useUserProfile } from '@/components/providers/userProfileContext'

// Get workspaces
export const GET = requireAdmin(async () => {
  const workspaces = await getWorkspaces()
  return ApiResponses.json(workspaces)
})

export const POST = requireAdmin(async (req: Request) => {
  const session = useUserProfile()
  const { name } = await req.json()
  const slug = slugify(name)

  try {
    const workspace = await createWorkspace({
      userId: session!.id,
      name,
      slug,
    })
    return ApiResponses.json(workspace)
  } catch (e) {
    const interpretedException = interpretDbException(e)
    if (
      interpretedException instanceof KnownDbError &&
      interpretedException.code === KnownDbErrorCode.DUPLICATE_KEY
    ) {
      return ApiResponses.conflict(`A workspace with the same slug ${slug} already exists`)
    }
    return defaultErrorResponse(interpretedException)
  }
})
