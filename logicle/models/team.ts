import { TeamRoleId } from '@/types/team'
import { Team } from '@/types/db'
import { db } from 'db/database'
import { nanoid } from 'nanoid'

export const createTeam = async (param: { userId: string; name: string; slug: string }) => {
  const { userId, name, slug } = param
  const teamId = nanoid()
  await db
    .insertInto('Team')
    .values({
      id: teamId,
      name,
      slug,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .executeTakeFirstOrThrow()
  await addTeamMember(teamId, userId, TeamRoleId.OWNER)
  return getTeam({ slug })
}

export const getTeam = async (key: { slug: string }) => {
  return await db
    .selectFrom('Team')
    .selectAll()
    .where('slug', '=', key.slug)
    .executeTakeFirstOrThrow()
}

export const deleteTeam = async (slug: string) => {
  return await db.deleteFrom('Team').where('slug', '=', slug).execute()
}

export const addTeamMember = async (teamId: string, userId: string, roleId: TeamRoleId) => {
  return await db
    .insertInto('TeamMember')
    .values({
      id: nanoid(),
      teamId,
      userId,
      roleId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .execute()
}

export const removeTeamMember = async (teamId: string, userId: string) => {
  db.deleteFrom('TeamMember')
    .where((eb) => eb.and([eb('teamId', '=', teamId), eb('userId', '=', userId)]))
    .execute()
}

export const getAllTeams = async () => {
  return await db
    .selectFrom('Team')
    .selectAll('Team')
    .select((eb) => [
      'Team.id',
      'Team.name',
      'Team.slug',
      'Team.domain',
      'Team.createdAt',
      'Team.updatedAt',
      eb
        .selectFrom('TeamMember')
        .select(({ fn }) => fn.countAll().as('count'))
        .whereRef('TeamMember.teamId', '=', 'Team.id')
        .as('memberCount'),
    ])
    .execute()
}

export async function getTeamRoles(userId: string) {
  return await db
    .selectFrom('TeamMember')
    .select(['teamId', 'roleId'])
    .where('userId', '=', userId)
    .execute()
}

export const getTeamMembers = async (slug: string) => {
  return await db
    .selectFrom('TeamMember')
    .leftJoin('User', (join) => join.onRef('User.id', '=', 'TeamMember.userId'))
    .select([
      'TeamMember.id',
      'TeamMember.createdAt',
      'TeamMember.roleId',
      'TeamMember.teamId',
      'TeamMember.updatedAt',
      'TeamMember.userId',
      'User.name',
      'User.email',
    ])
    .execute()
}
export const updateTeam = async (slug: string, data: Partial<Team>) => {
  const values: Partial<Team> = { ...data }
  return await db
    .updateTable('Team')
    .set({
      ...values,
      updatedAt: new Date().toISOString(),
    })
    .where('slug', '=', slug)
    .execute()
}
