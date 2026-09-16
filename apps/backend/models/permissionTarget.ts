import { db } from '@/db/database'
import type * as schema from '@/db/schema'
import * as dto from '@/types/dto'
import { UserRole } from '@/types/dto'
import type { Kysely, Transaction } from 'kysely'
import { getUserWorkspaceMemberships } from './user'

type DbExecutor = Kysely<schema.DB> | Transaction<schema.DB>
export type PermissionTargetRef = { id: string; ownerId?: string }

export const toolPermissionTarget = (toolId: string): PermissionTargetRef => ({ id: toolId })

export const satellitePermissionTarget = (
  satelliteId: string,
  ownerId?: string
): PermissionTargetRef => ({ id: satelliteId, ownerId })

const keyFor = (ref: PermissionTargetRef) => ref.id

const makeSharing = (
  sharing: schema.PermissionTarget['sharing'],
  workspaces: string[]
): dto.Sharing2 => {
  if (sharing === 'public') return { type: 'public' }
  if (sharing === 'workspace') return { type: 'workspace', workspaces }
  return { type: 'private' }
}

export const getPermissionTarget = async (
  targetId: string
): Promise<schema.PermissionTarget | undefined> => {
  return await db
    .selectFrom('PermissionTarget')
    .selectAll()
    .where('id', '=', targetId)
    .executeTakeFirst()
}

export const getPermissionTargetsSharing = async (
  refs: PermissionTargetRef[]
): Promise<Map<string, dto.Sharing2>> => {
  const uniqueIds = [...new Set(refs.map((ref) => ref.id))]
  const result = new Map<string, dto.Sharing2>()
  if (uniqueIds.length === 0) return result

  const targets = await db
    .selectFrom('PermissionTarget')
    .selectAll()
    .where('id', 'in', uniqueIds)
    .execute()
  const workspaceRows = await db
    .selectFrom('PermissionTargetWorkspace')
    .selectAll()
    .where('permissionTargetId', 'in', uniqueIds)
    .execute()
  const workspacesByTarget = new Map<string, string[]>()
  for (const row of workspaceRows) {
    const workspaces = workspacesByTarget.get(row.permissionTargetId) ?? []
    workspaces.push(row.workspaceId)
    workspacesByTarget.set(row.permissionTargetId, workspaces)
  }

  for (const target of targets) {
    result.set(target.id, makeSharing(target.sharing, workspacesByTarget.get(target.id) ?? []))
  }
  return result
}

const replacePermissionTargetWorkspaces = async (
  targetId: string,
  sharing: dto.Sharing2,
  executor: DbExecutor = db
) => {
  await executor
    .deleteFrom('PermissionTargetWorkspace')
    .where('permissionTargetId', '=', targetId)
    .execute()
  const workspaceIds = sharing.type === 'workspace' ? [...new Set(sharing.workspaces)] : []
  if (workspaceIds.length !== 0) {
    await executor
      .insertInto('PermissionTargetWorkspace')
      .values(
        workspaceIds.map((workspaceId) => ({
          permissionTargetId: targetId,
          workspaceId,
        }))
      )
      .execute()
  }
}

export const createPermissionTargetAnd = async <T>(
  ref: PermissionTargetRef,
  sharing: dto.Sharing2,
  insertEntity: (executor: DbExecutor) => Promise<T>
): Promise<T> => {
  return await db.transaction().execute(async (trx) => {
    await trx
      .insertInto('PermissionTarget')
      .values({ id: ref.id, sharing: sharing.type })
      .executeTakeFirstOrThrow()
    await replacePermissionTargetWorkspaces(ref.id, sharing, trx)
    return await insertEntity(trx)
  })
}

export const updatePermissionTargetSharing = async (
  targetId: string,
  sharing: dto.Sharing2
): Promise<dto.Sharing2> => {
  await db.transaction().execute(async (trx) => {
    await trx
      .updateTable('PermissionTarget')
      .set({ sharing: sharing.type })
      .where('id', '=', targetId)
      .executeTakeFirstOrThrow()
    await replacePermissionTargetWorkspaces(targetId, sharing, trx)
  })
  return sharing
}

export const deletePermissionTarget = async (targetId: string): Promise<void> => {
  await db.deleteFrom('PermissionTarget').where('id', '=', targetId).execute()
}

export type PermissionTargetAccessPrincipal = {
  userId: string
  userRole?: schema.UserRole
}

const isAdmin = async (principal: PermissionTargetAccessPrincipal) => {
  if (principal.userRole) return principal.userRole === UserRole.ADMIN
  const row = await db
    .selectFrom('User')
    .select('role')
    .where('id', '=', principal.userId)
    .executeTakeFirst()
  return row?.role === UserRole.ADMIN
}

/** Private satellites are visible to their owner. Private tools retain the
 * existing admin-only behavior because tools do not have an owner column. */
export const filterVisiblePermissionTargetKeys = async (
  principal: PermissionTargetAccessPrincipal,
  refs: PermissionTargetRef[]
): Promise<Set<string>> => {
  const uniqueRefs = [...new Map(refs.map((ref) => [keyFor(ref), ref])).values()]
  const visible = new Set<string>()
  if (uniqueRefs.length === 0) return visible

  const [targets, memberships, admin] = await Promise.all([
    db
      .selectFrom('PermissionTarget')
      .selectAll()
      .where('id', 'in', uniqueRefs.map((ref) => ref.id))
      .execute(),
    getUserWorkspaceMemberships(principal.userId),
    isAdmin(principal),
  ])
  const ownerByTargetId = new Map(
    uniqueRefs
      .filter((ref) => ref.ownerId !== undefined)
      .map((ref) => [ref.id, ref.ownerId!])
  )
  const workspaceIds = new Set(memberships.map((membership) => membership.id))
  const workspaceRows = await db
    .selectFrom('PermissionTargetWorkspace')
    .selectAll()
    .where('permissionTargetId', 'in', uniqueRefs.map((ref) => ref.id))
    .execute()
  const workspacesByTarget = new Map<string, Set<string>>()
  for (const row of workspaceRows) {
    const workspaces = workspacesByTarget.get(row.permissionTargetId) ?? new Set<string>()
    workspaces.add(row.workspaceId)
    workspacesByTarget.set(row.permissionTargetId, workspaces)
  }

  for (const target of targets) {
    const ownerId = ownerByTargetId.get(target.id)
    if (
      target.sharing === 'public' ||
      ownerId === principal.userId ||
      (target.sharing === 'private' && admin) ||
      (target.sharing === 'workspace' &&
        [...(workspacesByTarget.get(target.id) ?? [])].some((workspaceId) => workspaceIds.has(workspaceId)))
    ) {
      visible.add(target.id)
    }
  }
  return visible
}

export const permissionTargetKey = keyFor
