import { describe, expect, test, vi, beforeEach } from 'vitest'
import type { LlmModel } from '@/lib/chat/models'
import type { ToolFunction, ToolInvokeParams, ToolParams } from '@/lib/chat/tools'
import { RENDER_WIDGET_FUNCTION_NAME } from '@/lib/tools/customWidget'

const getFileWithId = vi.fn()
const canAccessFile = vi.fn()

vi.mock('@/models/file', () => ({ getFileWithId: (id: string) => getFileWithId(id) }))
vi.mock('@/backend/lib/files/authorization', () => ({
  canAccessFile: (user: unknown, id: string) => canAccessFile(user, id),
}))

const { CustomWidget } = await import('../implementation')

const model = { model: 'gpt-4o-mini' } as unknown as LlmModel
const toolParams: ToolParams = {
  id: 't1',
  name: 'custom_widget',
  promptFragment: '',
  provisioned: false,
}

const invokeParams = (params: Record<string, unknown>): ToolInvokeParams => ({
  llmModel: model,
  messages: [],
  assistantId: 'a1',
  userId: 'u1',
  params,
  uiLink: { debugMessage: vi.fn(), addCitations: vi.fn(), attachments: [], citations: [] },
})

const getRenderWidget = async () => {
  const tool = new CustomWidget(toolParams)
  const functions = await tool.functions(model, { userId: 'u1' })
  expect(Object.keys(functions)).toEqual([RENDER_WIDGET_FUNCTION_NAME])
  return functions[RENDER_WIDGET_FUNCTION_NAME] as ToolFunction
}

beforeEach(() => {
  getFileWithId.mockReset()
  canAccessFile.mockReset()
  getFileWithId.mockResolvedValue({ id: 'f', type: 'image/png' })
  canAccessFile.mockResolvedValue(true)
})

describe('custom_widget render_widget', () => {
  test('returns the validated spec as a json payload on success', async () => {
    const fn = await getRenderWidget()
    const result = await fn.invoke(
      invokeParams({
        type: 'image-compare',
        items: [{ fileId: 'a' }, { fileId: 'b', label: 'Original' }],
      })
    )
    expect(result).toEqual({
      type: 'json',
      value: {
        customWidget: {
          type: 'image-compare',
          items: [{ fileId: 'a' }, { fileId: 'b', label: 'Original' }],
        },
      },
    })
    expect(canAccessFile).toHaveBeenCalledWith({ userId: 'u1' }, 'a')
    expect(canAccessFile).toHaveBeenCalledWith({ userId: 'u1' }, 'b')
  })

  test('rejects a spec that is not a known widget', async () => {
    const fn = await getRenderWidget()
    const result = await fn.invoke(invokeParams({ type: 'video-player', items: [{ fileId: 'a' }] }))
    expect(result.type).toBe('error-text')
    expect(canAccessFile).not.toHaveBeenCalled()
  })

  test('rejects image-compare without exactly two items', async () => {
    const fn = await getRenderWidget()
    const result = await fn.invoke(
      invokeParams({ type: 'image-compare', items: [{ fileId: 'a' }] })
    )
    expect(result.type).toBe('error-text')
  })

  test('fails closed when a referenced file is not accessible', async () => {
    canAccessFile.mockResolvedValue(false)
    const fn = await getRenderWidget()
    const result = await fn.invoke(
      invokeParams({ type: 'image-carousel', items: [{ fileId: 'a' }, { fileId: 'secret' }] })
    )
    expect(result.type).toBe('error-text')
    if (result.type !== 'error-text') throw new Error('expected error-text')
    expect(result.value).toContain('not accessible')
  })

  test('rejects a referenced file that is not an image', async () => {
    getFileWithId.mockResolvedValue({ id: 'f', type: 'application/pdf' })
    const fn = await getRenderWidget()
    const result = await fn.invoke(
      invokeParams({ type: 'image-carousel', items: [{ fileId: 'a' }] })
    )
    expect(result.type).toBe('error-text')
    if (result.type !== 'error-text') throw new Error('expected error-text')
    expect(result.value).toContain('not an image')
  })
})
