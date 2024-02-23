import { Workspace } from '@/types/db'
import { WorkspaceRole } from '@/types/workspace'
import { db } from 'db/database'
import { nanoid } from 'nanoid'

export const createWorkspace = async (param: { userId: string; name: string; slug: string }) => {
  const { userId, name, slug } = param
  const workspaceId = nanoid()
  await db
    .insertInto('Workspace')
    .values({
      id: workspaceId,
      name,
      slug,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .executeTakeFirstOrThrow()
  await addWorkspaceMember(workspaceId, userId, WorkspaceRole.OWNER)
  return getWorkspace({ slug })
}

export const getWorkspace = async (key: { slug: string }) => {
  return await db
    .selectFrom('Workspace')
    .selectAll()
    .where('slug', '=', key.slug)
    .executeTakeFirstOrThrow()
}

export const deleteWorkspace = async (slug: string) => {
  return await db.deleteFrom('Workspace').where('slug', '=', slug).execute()
}

export const addWorkspaceMember = async (
  workspaceId: string,
  userId: string,
  role: WorkspaceRole
) => {
  return await db
    .insertInto('WorkspaceMember')
    .values({
      id: nanoid(),
      workspaceId,
      userId,
      role,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })
    .execute()
}

export const removeWorkspaceMember = async (workspaceId: string, userId: string) => {
  db.deleteFrom('WorkspaceMember')
    .where((eb) => eb.and([eb('workspaceId', '=', workspaceId), eb('userId', '=', userId)]))
    .execute()
}

export const getWorkspaces = async () => {
  return await db
    .selectFrom('Workspace')
    .selectAll('Workspace')
    .select((eb) => [
      'Workspace.id',
      'Workspace.name',
      'Workspace.slug',
      'Workspace.domain',
      'Workspace.createdAt',
      'Workspace.updatedAt',
      eb
        .selectFrom('WorkspaceMember')
        .select(({ fn }) => fn.countAll().as('count'))
        .whereRef('WorkspaceMember.workspaceId', '=', 'Workspace.id')
        .as('memberCount'),
    ])
    .execute()
}

export async function getWorkspaceRoles(userId: string) {
  return await db
    .selectFrom('WorkspaceMember')
    .select(['workspaceId', 'role'])
    .where('userId', '=', userId)
    .execute()
}

export const getWorkspaceMembers = async (slug: string) => {
  return await db
    .selectFrom('WorkspaceMember')
    .leftJoin('User', (join) => join.onRef('User.id', '=', 'WorkspaceMember.userId'))
    .select([
      'WorkspaceMember.id',
      'WorkspaceMember.createdAt',
      'WorkspaceMember.role',
      'WorkspaceMember.workspaceId',
      'WorkspaceMember.updatedAt',
      'WorkspaceMember.userId',
      'User.name',
      'User.email',
    ])
    .execute()
}
export const updateWorkspace = async (slug: string, data: Partial<Workspace>) => {
  const values: Partial<Workspace> = { ...data }
  return await db
    .updateTable('Workspace')
    .set({
      ...values,
      updatedAt: new Date().toISOString(),
    })
    .where('slug', '=', slug)
    .execute()
}
