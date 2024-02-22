import { requireAdmin } from '@/api/utils/auth'
import { addTeamMember, getTeam, getTeamMembers, removeTeamMember } from 'models/team'
import ApiResponses from '@/api/utils/ApiResponses'
import { NextRequest } from 'next/server'
import { TeamRoleName, mapRole, roleDto } from '@/types/team'
import { db } from 'db/database'
import {
  KnownDbError,
  KnownDbErrorCode,
  defaultErrorResponse,
  interpretDbException,
} from '@/db/exception'
import { getUserById } from 'models/user'

// Get members of a team
export const GET = requireAdmin(async (req: Request, route: { params: { slug: string } }) => {
  const members = (await getTeamMembers(route.params.slug)).map((memberShip) => {
    return {
      ...memberShip,
      role: roleDto(memberShip.roleId),
    }
  })
  return ApiResponses.json(members)
})

// Delete the member from the team
export const DELETE = requireAdmin(
  async (req: NextRequest, route: { params: { slug: string } }) => {
    const memberId = req.nextUrl.searchParams.get('memberId') ?? ''
    const team = await getTeam({ slug: route.params.slug })
    await removeTeamMember(team.id, memberId)
    return ApiResponses.success()
  }
)

interface AddTeamMemberRequest {
  userId: string
  role: TeamRoleName
}

export const POST = requireAdmin(async (req: Request, route: { params: { slug: string } }) => {
  const team = await getTeam({ slug: route.params.slug })
  const teamMember = (await req.json()) as AddTeamMemberRequest
  const user = await getUserById(teamMember.userId)
  if (!user) {
    return ApiResponses.invalidParameter(`Invalid user id`)
  }
  const roleId = mapRole(teamMember.role)
  if (roleId === undefined) {
    return ApiResponses.invalidParameter(`Invalid role : ${teamMember.role}`)
  }
  try {
    await addTeamMember(team.id, teamMember.userId, roleId)
  } catch (e) {
    const interpretedException = interpretDbException(e)
    if (
      interpretedException instanceof KnownDbError &&
      interpretedException.code == KnownDbErrorCode.DUPLICATE_KEY
    ) {
      return ApiResponses.conflict(`${user.name} is already a member of this team`)
    }
    return defaultErrorResponse(interpretedException)
  }
  return ApiResponses.success()
})

export const PATCH = requireAdmin(async (req: Request, route: { params: { slug: string } }) => {
  const team = await getTeam({ slug: route.params.slug })
  const { memberId, role } = (await req.json()) as {
    memberId: string
    role: TeamRoleName
  }

  const roleId = mapRole(role)
  if (roleId == undefined) {
    return ApiResponses.invalidParameter(`Invalid role ${role}`)
  }

  await db
    .updateTable('TeamMember')
    .set({ roleId: roleId })
    .where((eb) => eb.and([eb('userId', '=', memberId), eb('teamId', '=', team.id)]))
    .execute()
  return ApiResponses.success()
})
