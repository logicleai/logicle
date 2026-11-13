import Database from 'better-sqlite3'
import { Kysely, SqliteDialect } from 'kysely'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { DB } from '@/db/schema'
import type { SatelliteConnection } from '@/lib/satellite/hub'
import { UserRole, type Sharing2, type WorkspaceMembership } from '@/types/dto'
import { WorkspaceRole } from '@/types/workspace'

const state = vi.hoisted(() => ({
  db: undefined as unknown as Kysely<DB>,
  userId: 'owner',
  userRole: 'USER' as UserRole,
  memberships: {} as Record<string, WorkspaceMembership[]>,
  connections: new Map<string, SatelliteConnection>(),
}))

vi.mock('db/database', () => ({
  get db() {
    return state.db
  },
}))
vi.mock('@/api/utils/auth', () => ({
  authenticate: async () => ({
    success: true,
    value: { sessionId: 'test', userId: state.userId, userRole: state.userRole },
  }),
}))
vi.mock('@/models/user', () => ({
  getUserWorkspaceMemberships: async (id: string) => state.memberships[id] ?? [],
  getUserById: async (id: string) => ({ id, name: id }),
}))
vi.mock('@/lib/satellite/hub', () => ({
  hub: { connections: state.connections },
  connections: state.connections,
}))

import { createSatellite, filterVisibleSatelliteIds, getSatellite } from '@/models/satellite'
import * as satellitesRoute from '@/api/me/satellites/route'
import * as detailRoute from '@/api/me/satellites/[id]/route'
import * as adminDetailRoute from '@/api/satellites/[id]/route'
import * as connectedRoute from '@/api/me/satellites/connected/route'
import * as regenerateRoute from '@/api/me/satellites/[id]/regenerate-secret/route'

beforeEach(() => {
  const sqlite = new Database(':memory:')
  sqlite.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE PermissionTarget (id TEXT PRIMARY KEY, sharing TEXT NOT NULL);
    CREATE TABLE PermissionTargetWorkspace (
      permissionTargetId TEXT NOT NULL REFERENCES PermissionTarget(id) ON DELETE CASCADE,
      workspaceId TEXT NOT NULL,
      PRIMARY KEY (permissionTargetId, workspaceId)
    );
    CREATE TABLE Satellite (
      id TEXT PRIMARY KEY REFERENCES PermissionTarget(id), name TEXT NOT NULL,
      userId TEXT NOT NULL, secret TEXT, createdAt TEXT NOT NULL, updatedAt TEXT NOT NULL
    );
  `)
  state.db = new Kysely<DB>({ dialect: new SqliteDialect({ database: sqlite }) })
  state.userId = 'owner'
  state.userRole = UserRole.USER
  state.memberships = {}
  state.connections.clear()
})

afterEach(async () => {
  await state.db.destroy()
})

const request = (method = 'GET', body?: unknown) =>
  new Request('http://localhost/api/me/satellites', {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
  })
const params = (id: string) => ({ params: Promise.resolve({ id }) })
const list = async () =>
  (await satellitesRoute.GET(request(), { params: Promise.resolve({}) })).json()
const seed = async (sharing?: Sharing2) =>
  (await createSatellite('owner', { name: 'Shared satellite', sharing })).satellite
const principal = () => ({ userId: state.userId, userRole: state.userRole })

function connect(id: string, userId: string, kind: 'registered' | 'ephemeral' = 'registered') {
  state.connections.set(id, {
    satelliteId: id,
    userId,
    kind,
    name: id,
    tools: [],
    socket: {} as SatelliteConnection['socket'],
    pendingCalls: new Map(),
    connectedAt: new Date(),
  })
}

describe('satellite sharing', () => {
  test('creation defaults to private for existing clients', async () => {
    const response = await satellitesRoute.POST(request('POST', { name: 'Personal' }), {
      params: Promise.resolve({}),
    })
    expect(response.status).toBe(201)
    const created = await response.json()
    expect(created.sharing).toEqual({ type: 'private' })
    expect((await getSatellite(created.id))?.sharing).toEqual({ type: 'private' })
    state.userId = 'recipient'
    expect(await list()).toEqual([])
  })

  test.each([
    { type: 'public' } as Sharing2,
    { type: 'workspace', workspaces: ['w1'] } as Sharing2,
  ])('persists the selected sharing at creation: $type', async (sharing) => {
    state.userRole = UserRole.ADMIN
    const response = await satellitesRoute.POST(request('POST', { name: 'Shared', sharing }), {
      params: Promise.resolve({}),
    })
    expect(response.status).toBe(201)
    const created = await response.json()
    expect((await getSatellite(created.id))?.sharing).toEqual(sharing)
  })

  test('admin sharing makes another owner’s satellite selectable and revocation removes it', async () => {
    const satellite = await seed()
    state.userId = 'admin'
    state.userRole = UserRole.ADMIN
    const response = await adminDetailRoute.PATCH(
      request('PATCH', { sharing: { type: 'public' } }),
      params(satellite.id)
    )
    expect(response.status).toBe(200)
    expect((await response.json()).sharing).toEqual({ type: 'public' })

    state.userId = 'recipient'
    state.userRole = UserRole.USER
    connect(satellite.id, 'owner')
    expect(await list()).toEqual([
      expect.objectContaining({
        id: satellite.id,
        connected: true,
        canManage: false,
        ownerName: 'owner',
      }),
    ])
    expect((await filterVisibleSatelliteIds(principal(), [satellite.id])).has(satellite.id)).toBe(
      true
    )
    const detail = await detailRoute.GET(request(), params(satellite.id))
    expect(detail.status).toBe(200)
    expect((await detail.json()).secret).toBeNull()

    state.userId = 'admin'
    state.userRole = UserRole.ADMIN
    expect(
      (
        await adminDetailRoute.PATCH(
          request('PATCH', { sharing: { type: 'private' } }),
          params(satellite.id)
        )
      ).status
    ).toBe(200)
    state.userId = 'recipient'
    state.userRole = UserRole.USER
    expect(await list()).toEqual([])
    expect((await detailRoute.GET(request(), params(satellite.id))).status).toBe(404)
    expect((await filterVisibleSatelliteIds(principal(), [satellite.id])).size).toBe(0)
  })

  test('workspace satellites are visible only to the owner and members of selected workspaces', async () => {
    const satellite = await seed({ type: 'workspace', workspaces: ['w1'] })
    expect(await list()).toEqual([expect.objectContaining({ id: satellite.id, canManage: true })])
    state.userId = 'recipient'
    expect(await list()).toEqual([])
    state.memberships.recipient = [{ id: 'other', name: 'Other', role: WorkspaceRole.MEMBER }]
    expect(await list()).toEqual([])
    state.memberships.recipient = [
      { id: 'w1', name: 'Shared workspace', role: WorkspaceRole.MEMBER },
    ]
    expect(await list()).toEqual([expect.objectContaining({ id: satellite.id, canManage: false })])
  })

  test('sharing does not grant rename, sharing, deletion or credential rotation rights', async () => {
    const satellite = await seed({ type: 'public' })
    state.userId = 'recipient'
    expect(
      (await detailRoute.PATCH(request('PATCH', { name: 'Changed' }), params(satellite.id))).status
    ).toBe(404)
    expect(
      (
        await detailRoute.PATCH(
          request('PATCH', { sharing: { type: 'private' } }),
          params(satellite.id)
        )
      ).status
    ).toBe(404)
    expect((await detailRoute.DELETE(request('DELETE'), params(satellite.id))).status).toBe(404)
    expect((await regenerateRoute.POST(request('POST'), params(satellite.id))).status).toBe(404)
    expect((await getSatellite(satellite.id))?.name).toBe(satellite.name)
  })

  test('connected list includes shared registered satellites and only the user’s own ephemeral bridge', async () => {
    const visible = await seed({ type: 'public' })
    const hidden = await seed()
    connect(visible.id, 'owner')
    connect(hidden.id, 'owner')
    connect('personal-owner', 'owner', 'ephemeral')
    connect('personal-recipient', 'recipient', 'ephemeral')
    state.userId = 'recipient'
    const response = await connectedRoute.GET(request(), { params: Promise.resolve({}) })
    expect(await response.json()).toEqual([
      { satelliteId: visible.id, satelliteName: visible.id },
      { satelliteId: 'personal-recipient', satelliteName: 'personal-recipient' },
    ])
    const items = await list()
    expect(items.map((item: { id: string }) => item.id)).toEqual([visible.id, 'personal-recipient'])
    expect(items.every((item: Record<string, unknown>) => !('secret' in item))).toBe(true)
  })

  test('ordinary users cannot make satellites public through create or update', async () => {
    const response = await satellitesRoute.POST(
      request('POST', { name: 'Public', sharing: { type: 'public' } }),
      { params: Promise.resolve({}) }
    )
    expect(response.status).toBe(403)
    const satellite = await seed()
    expect(
      (
        await detailRoute.PATCH(
          request('PATCH', { sharing: { type: 'public' } }),
          params(satellite.id)
        )
      ).status
    ).toBe(403)
    expect((await getSatellite(satellite.id))?.sharing).toEqual({ type: 'private' })
  })

  test.each([WorkspaceRole.OWNER, WorkspaceRole.ADMIN, WorkspaceRole.EDITOR])(
    'a workspace %s can share at creation',
    async (role) => {
      state.memberships.owner = [{ id: 'w1', name: 'Workspace', role }]
      const response = await satellitesRoute.POST(
        request('POST', { name: 'Shared', sharing: { type: 'workspace', workspaces: ['w1'] } }),
        { params: Promise.resolve({}) }
      )
      expect(response.status).toBe(201)
    }
  )

  test('workspace members cannot share with workspaces they do not manage', async () => {
    state.memberships.owner = [{ id: 'w1', name: 'Workspace', role: WorkspaceRole.MEMBER }]
    for (const workspaces of [['w1'], ['unknown']]) {
      const response = await satellitesRoute.POST(
        request('POST', { name: 'Shared', sharing: { type: 'workspace', workspaces } }),
        { params: Promise.resolve({}) }
      )
      expect(response.status).toBe(403)
    }
  })

  test('empty workspace selection is rejected on create and update', async () => {
    const sharing = { type: 'workspace', workspaces: [] }
    expect(
      (
        await satellitesRoute.POST(request('POST', { name: 'Empty', sharing }), {
          params: Promise.resolve({}),
        })
      ).status
    ).toBe(400)
    const satellite = await seed()
    expect(
      (await detailRoute.PATCH(request('PATCH', { sharing }), params(satellite.id))).status
    ).toBe(400)
  })
})
