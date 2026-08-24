import { beforeEach, describe, expect, test, vi } from 'vitest'

const assistantVersionToolsMock = vi.fn()
const canUserAccessAssistantMock = vi.fn()
const getPublishedAssistantVersionMock = vi.fn()
const filterVisibleToolIdsMock = vi.fn()
const getToolsFilteredMock = vi.fn()
const getBuildableToolsMock = vi.fn()

vi.mock('@/models/assistant', () => ({
  assistantVersionTools: assistantVersionToolsMock,
  canUserAccessAssistant: canUserAccessAssistantMock,
  getPublishedAssistantVersion: getPublishedAssistantVersionMock,
}))

vi.mock('@/models/tool', () => ({
  filterVisibleToolIds: filterVisibleToolIdsMock,
  getToolsFiltered: getToolsFilteredMock,
  getBuildableTools: getBuildableToolsMock,
}))

const executeTakeFirstMock = vi.fn()
vi.mock('db/database', () => ({
  db: {
    selectFrom: () => ({
      select: () => ({
        where: () => ({
          executeTakeFirst: executeTakeFirstMock,
        }),
      }),
    }),
  },
}))

function makeTool(id: string, type: string) {
  return {
    id,
    name: id,
    type,
    configuration: {},
    promptFragment: '',
    provisioned: false,
    satelliteId: null,
  }
}

describe('enumerate.ts tool visibility filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    executeTakeFirstMock.mockResolvedValue(undefined)
    getToolsFilteredMock.mockResolvedValue([])
  })

  test('availableToolsForAssistantVersion never builds a tool the principal cannot see', async () => {
    assistantVersionToolsMock.mockResolvedValue([makeTool('t-visible', 'dummy'), makeTool('t-hidden', 'dummy')])
    filterVisibleToolIdsMock.mockResolvedValue(new Set(['t-visible']))

    const { availableToolsForAssistantVersion } = await import('@/backend/lib/tools/enumerate')
    const tools = await availableToolsForAssistantVersion('av1', 'gpt-4o', { userId: 'u1' })

    expect(filterVisibleToolIdsMock).toHaveBeenCalledWith({ userId: 'u1' }, ['t-visible', 't-hidden'])
    expect(tools).toHaveLength(1)
    expect(tools[0].toolParams.id).toBe('t-visible')
  })

  test('availableToolsFiltered filters ids through visibility before resolving them', async () => {
    filterVisibleToolIdsMock.mockResolvedValue(new Set(['t-visible']))
    getToolsFilteredMock.mockResolvedValue([makeTool('t-visible', 'dummy')])

    const { availableToolsFiltered } = await import('@/backend/lib/tools/enumerate')
    const tools = await availableToolsFiltered(['t-visible', 't-hidden'], 'gpt-4o', { userId: 'u1' })

    expect(filterVisibleToolIdsMock).toHaveBeenCalledWith({ userId: 'u1' }, ['t-visible', 't-hidden'])
    expect(getToolsFilteredMock).toHaveBeenCalledWith(['t-visible'])
    expect(tools).toHaveLength(1)
  })

  test('buildSubAssistantTool drops a sub-assistant the principal cannot access, and never leaks its name', async () => {
    canUserAccessAssistantMock.mockImplementation(
      async (_userId: string, id: string) => id === 'assistant-visible'
    )
    getPublishedAssistantVersionMock.mockImplementation(async (id: string) => ({
      name: id === 'assistant-visible' ? 'Visible Assistant' : 'SECRET PRIVATE ASSISTANT',
      description: '',
    }))

    const { buildSubAssistantTool } = await import('@/backend/lib/tools/enumerate')
    const tool = await buildSubAssistantTool(['assistant-visible', 'assistant-hidden'], {
      userId: 'u1',
    })

    expect(canUserAccessAssistantMock).toHaveBeenCalledWith('u1', 'assistant-visible')
    expect(canUserAccessAssistantMock).toHaveBeenCalledWith('u1', 'assistant-hidden')
    // getPublishedAssistantVersion (which would reveal the name) is never even
    // called for the inaccessible sub-assistant.
    expect(getPublishedAssistantVersionMock).not.toHaveBeenCalledWith('assistant-hidden')
    expect(tool?.toolParams.promptFragment).toContain('Visible Assistant')
    expect(tool?.toolParams.promptFragment).not.toContain('SECRET PRIVATE ASSISTANT')
    expect(tool?.toolParams.promptFragment).not.toContain('assistant-hidden')
  })

  test('buildSubAssistantTool returns undefined when no sub-assistant is accessible', async () => {
    canUserAccessAssistantMock.mockResolvedValue(false)

    const { buildSubAssistantTool } = await import('@/backend/lib/tools/enumerate')
    const tool = await buildSubAssistantTool(['assistant-hidden'], { userId: 'u1' })

    expect(tool).toBeUndefined()
    expect(getPublishedAssistantVersionMock).not.toHaveBeenCalled()
  })
})
