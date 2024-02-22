import { requireAdmin } from '@/api/utils/auth'
import { deleteTeam, getTeam, updateTeam } from 'models/team'
import ApiResponses from '@/api/utils/ApiResponses'
import { Team } from '@/types/db'

// Get a team by slug
export const GET = requireAdmin(async (req: Request, route: { params: { slug: string } }) => {
  const team = await getTeam({ slug: route.params.slug })
  return ApiResponses.json(team)
})

// Update a team
export const PUT = requireAdmin(async (req: Request, route: { params: { slug: string } }) => {
  const team = (await req.json()) as Team
  await updateTeam(route.params.slug, {
    name: team.name,
    slug: team.slug,
    domain: team.domain,
  })
  const updatedTeam = await getTeam({ slug: team.slug })
  return ApiResponses.json(updatedTeam)
})

// Delete a team
export const DELETE = requireAdmin(async (req: Request, route: { params: { slug: string } }) => {
  await deleteTeam(route.params.slug)
  return ApiResponses.success()
})
