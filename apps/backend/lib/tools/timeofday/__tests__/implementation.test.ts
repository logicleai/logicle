import { describe, expect, test, vi } from 'vitest'
import type { LlmModel } from '@/lib/chat/models'
import type { ToolFunction, ToolParams } from '@/lib/chat/tools'
import { TimeOfDay } from '../implementation'

const model = { model: 'gpt-4o-mini' } as unknown as LlmModel

const toolParams: ToolParams = {
  id: 't1',
  name: 'timeofday',
  promptFragment: '',
  provisioned: false,
}

describe('TimeOfDay tool', () => {
  test('builder constructs an instance from raw tool params', () => {
    const tool = TimeOfDay.builder(toolParams, {}, model.model) as TimeOfDay
    expect(tool).toBeInstanceOf(TimeOfDay)
    expect(tool.toolParams).toBe(toolParams)
    expect(tool.supportedMedia).toEqual([])
  })

  test('exposes a single timeOfDay function requiring no parameters', async () => {
    const tool = new TimeOfDay(toolParams)
    const functions = await tool.functions(model, { userId: 'u1' })
    expect(Object.keys(functions)).toEqual(['timeOfDay'])
    const timeOfDay = functions.timeOfDay as ToolFunction
    expect(timeOfDay.parameters).toEqual({
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    })
    expect(timeOfDay.requireConfirm).toBe(false)
  })

  test('invoking timeOfDay returns the current time as an ISO 8601 string', async () => {
    const tool = new TimeOfDay(toolParams)
    const functions = await tool.functions(model, { userId: 'u1' })
    const timeOfDay = functions.timeOfDay as ToolFunction
    const before = Date.now()
    const result = await timeOfDay.invoke({
      llmModel: model,
      messages: [],
      assistantId: 'a1',
      userId: 'u1',
      params: {},
      uiLink: { debugMessage: vi.fn(), addCitations: vi.fn(), attachments: [], citations: [] },
    })
    const after = Date.now()

    expect(result.type).toBe('text')
    if (result.type !== 'text') throw new Error('expected a text result')
    const returned = new Date(result.value).getTime()
    expect(returned).toBeGreaterThanOrEqual(before)
    expect(returned).toBeLessThanOrEqual(after)
  })
})
