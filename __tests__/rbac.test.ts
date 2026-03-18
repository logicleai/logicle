import { describe, expect, test } from 'vitest'
import { canEditAssistant, canDeleteAssistant, isToolVisible } from '@/lib/rbac'
import { WorkspaceRole } from '@/types/workspace'
import type * as dto from '@/types/dto'

// ---- canEditAssistant ----

describe('canEditAssistant', () => {
  const membership = (id: string, role: WorkspaceRole): dto.WorkspaceMembership => ({
    id,
    name: 'ws',
    role,
  })

  test('owner can always edit', () => {
    const assistant = { owner: 'u1', sharing: [] }
    expect(canEditAssistant(assistant, 'u1', [])).toBe(true)
  })

  test('non-owner with no memberships cannot edit', () => {
    const assistant = { owner: 'u1', sharing: [] }
    expect(canEditAssistant(assistant, 'u2', [])).toBe(false)
  })

  test('non-owner cannot edit if shared to all', () => {
    const assistant = { owner: 'u1', sharing: [{ type: 'all' as const }] }
    expect(canEditAssistant(assistant, 'u2', [membership('ws1', WorkspaceRole.ADMIN)])).toBe(false)
  })

  test('editor in shared workspace can edit', () => {
    const assistant = {
      owner: 'u1',
      sharing: [{ type: 'workspace' as const, workspaceId: 'ws1', workspaceName: 'WS' }],
    }
    expect(canEditAssistant(assistant, 'u2', [membership('ws1', WorkspaceRole.EDITOR)])).toBe(true)
  })

  test('admin in shared workspace can edit', () => {
    const assistant = {
      owner: 'u1',
      sharing: [{ type: 'workspace' as const, workspaceId: 'ws1', workspaceName: 'WS' }],
    }
    expect(canEditAssistant(assistant, 'u2', [membership('ws1', WorkspaceRole.ADMIN)])).toBe(true)
  })

  test('workspace owner in shared workspace can edit', () => {
    const assistant = {
      owner: 'u1',
      sharing: [{ type: 'workspace' as const, workspaceId: 'ws1', workspaceName: 'WS' }],
    }
    expect(canEditAssistant(assistant, 'u2', [membership('ws1', WorkspaceRole.OWNER)])).toBe(true)
  })

  test('member in shared workspace cannot edit', () => {
    const assistant = {
      owner: 'u1',
      sharing: [{ type: 'workspace' as const, workspaceId: 'ws1', workspaceName: 'WS' }],
    }
    expect(canEditAssistant(assistant, 'u2', [membership('ws1', WorkspaceRole.MEMBER)])).toBe(false)
  })

  test('editor in a different workspace cannot edit', () => {
    const assistant = {
      owner: 'u1',
      sharing: [{ type: 'workspace' as const, workspaceId: 'ws1', workspaceName: 'WS' }],
    }
    expect(canEditAssistant(assistant, 'u2', [membership('ws2', WorkspaceRole.EDITOR)])).toBe(false)
  })
})

// ---- canDeleteAssistant ----

describe('canDeleteAssistant', () => {
  const baseAssistant = {
    owner: 'u1',
    id: 'a1',
    name: 'A',
    sharing: [],
  } as unknown as dto.UserAssistant

  test('owner can delete', () => {
    const profile = { id: 'u1', role: 'USER' } as unknown as dto.UserProfile
    expect(canDeleteAssistant(baseAssistant, profile)).toBe(true)
  })

  test('admin can delete', () => {
    const profile = { id: 'u2', role: 'ADMIN' } as unknown as dto.UserProfile
    expect(canDeleteAssistant(baseAssistant, profile)).toBe(true)
  })

  test('non-owner non-admin cannot delete', () => {
    const profile = { id: 'u2', role: 'USER' } as unknown as dto.UserProfile
    expect(canDeleteAssistant(baseAssistant, profile)).toBe(false)
  })

  test('undefined profile cannot delete', () => {
    expect(canDeleteAssistant(baseAssistant, undefined)).toBe(false)
  })
})

// ---- isToolVisible ----

describe('isToolVisible', () => {
  test('public tool is visible to everyone', () => {
    const tool = { sharing: { type: 'public' } } as dto.Tool
    expect(isToolVisible(tool, 'USER', [])).toBe(true)
  })

  test('workspace tool is visible when user is in that workspace', () => {
    const tool = { sharing: { type: 'workspace', workspaces: ['ws1'] } } as dto.Tool
    expect(isToolVisible(tool, 'USER', ['ws1'])).toBe(true)
  })

  test('workspace tool is not visible when user is in a different workspace', () => {
    const tool = { sharing: { type: 'workspace', workspaces: ['ws1'] } } as dto.Tool
    expect(isToolVisible(tool, 'USER', ['ws2'])).toBe(false)
  })

  test('private tool is visible only to admins', () => {
    const tool = { sharing: { type: 'private' } } as dto.Tool
    expect(isToolVisible(tool, 'ADMIN', [])).toBe(true)
    expect(isToolVisible(tool, 'USER', [])).toBe(false)
  })
})
