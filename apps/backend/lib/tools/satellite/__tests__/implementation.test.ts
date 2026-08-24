import { describe, expect, test, vi } from 'vitest'
import type { ToolParams } from '@/lib/chat/tools'

const connections = new Map<string, any>()

vi.mock('@/lib/satellite/hub', () => ({
  connections,
}))

const toolParams: ToolParams = {
  id: 'sat-1',
  provisioned: false,
  promptFragment: '',
  name: 'My Satellite',
}

describe('SatelliteTool.functions', () => {
  test('returns callable functions for the satellite connection owner', async () => {
    connections.clear()
    connections.set('sat-1', {
      satelliteId: 'sat-1',
      userId: 'owner',
      kind: 'registered',
      tools: [{ name: 'do_thing', description: 'does a thing' }],
    })

    const { SatelliteTool } = await import('@/backend/lib/tools/satellite/implementation')
    const tool = new SatelliteTool(toolParams, 'sat-1')

    const fns = await tool.functions({} as any, { userId: 'owner' })
    expect(Object.keys(fns)).toEqual(['do_thing'])
  })

  test('rejects a user who does not own the satellite connection', async () => {
    connections.clear()
    connections.set('sat-1', {
      satelliteId: 'sat-1',
      userId: 'owner',
      kind: 'registered',
      tools: [{ name: 'do_thing', description: 'does a thing' }],
    })

    const { SatelliteTool } = await import('@/backend/lib/tools/satellite/implementation')
    const tool = new SatelliteTool(toolParams, 'sat-1')

    await expect(tool.functions({} as any, { userId: 'attacker' })).rejects.toThrow(
      /currently offline/
    )
  })

  test('rejects when the satellite is not connected at all', async () => {
    connections.clear()

    const { SatelliteTool } = await import('@/backend/lib/tools/satellite/implementation')
    const tool = new SatelliteTool(toolParams, 'sat-1')

    await expect(tool.functions({} as any, { userId: 'owner' })).rejects.toThrow(
      /currently offline/
    )
  })
})
