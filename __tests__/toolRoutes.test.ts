import { describe, expect, test, vi } from 'vitest'
import { z } from 'zod'

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  getTool: vi.fn(),
  updateTool: vi.fn(),
  toolConfigSchema: vi.fn(),
  extractSecretsFromConfig: vi.fn(),
  upsertToolSecret: vi.fn(),
}))

vi.mock('@/api/utils/auth', () => ({ authenticate: mocks.authenticate }))
vi.mock('@/models/tool', () => ({ getTool: mocks.getTool, updateTool: mocks.updateTool }))
vi.mock('@/backend/lib/tools/configSchema', () => ({ toolConfigSchema: mocks.toolConfigSchema }))
vi.mock('@/backend/lib/tools/configSecrets', () => ({
  extractSecretsFromConfig: mocks.extractSecretsFromConfig,
  maskSecretsInConfig: vi.fn(),
}))
vi.mock('@/models/toolSecrets', () => ({ upsertToolSecret: mocks.upsertToolSecret }))

import * as toolRoute from '@/api/tools/[toolId]/route'

describe('tool routes', () => {
  test('rejects invalid dynamic tool configuration without persisting it', async () => {
    mocks.authenticate.mockResolvedValue({
      success: true,
      value: { userId: 'admin-1', userRole: 'ADMIN' },
    })
    mocks.getTool.mockResolvedValue({
      id: 'tool-1',
      type: 'test-tool',
      configuration: {},
      provisioned: false,
    })
    mocks.toolConfigSchema.mockResolvedValue(z.object({ required: z.string() }))

    const response = await toolRoute.PATCH(
      new Request('http://localhost/api/tools/tool-1', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ configuration: { required: 42 } }),
      }),
      { params: Promise.resolve({ toolId: 'tool-1' }) }
    )

    expect(response.status).toBe(400)
    await expect(response.json()).resolves.toEqual({
      error: { message: 'Invalid tool configuration', values: {} },
    })
    expect(mocks.updateTool).not.toHaveBeenCalled()
    expect(mocks.upsertToolSecret).not.toHaveBeenCalled()
  })
})
