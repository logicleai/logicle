import { slugify } from '@/lib/common'
import { createTeam, getAllTeams } from 'models/team'
import ApiResponses from '@/api/utils/ApiResponses'
import { requireAdmin } from '@/api/utils/auth'
import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'
import { auth } from 'auth'

// Get teams
export const GET = requireAdmin(async () => {
  const teams = await getAllTeams()
  return ApiResponses.json(teams)
})

export const POST = requireAdmin(async (req: Request) => {
  const session = await auth()
  const { name } = await req.json()
  const slug = slugify(name)

  try {
    const team = await createTeam({
      userId: session!.user.id as string,
      name,
      slug,
    })
    return ApiResponses.json(team)
  } catch (e) {
    const interpretedException = interpretDbException(e)
    if (
      interpretedException instanceof KnownDbError &&
      interpretedException.code == KnownDbErrorCode.DUPLICATE_KEY
    ) {
      return ApiResponses.conflict(`A team with the same slug ${slug} already exists`)
    }
    return defaultErrorResponse(interpretedException)
  }
})
