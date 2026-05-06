import { describe, expect, test } from 'vitest'
import { ImageGeneratorPlugin } from '@/backend/lib/tools/imagegenerator/implementation'
import { shouldExposeImageEditingTool } from '@/backend/lib/imagegen/models'
import type { ToolParams } from '@/lib/chat/tools'
import type { LlmModel } from '@/lib/chat/models'

const toolParams: ToolParams = {
  id: 'tool-id',
  provisioned: false,
  promptFragment: '',
  name: 'Image tool',
}

const fakeModel: LlmModel = {
  id: 'test-model',
  model: 'gpt-image-1.5',
  name: 'Test model',
  provider: 'openai',
  owned_by: 'openai',
  description: '',
  context_length: 128000,
  capabilities: { vision: true, function_calling: true, reasoning: false, knowledge: false },
}

describe('image generator editing exposure', () => {
  test('legacy proxy-backed tool enables editing automatically for known supported models', async () => {
    const tool = new ImageGeneratorPlugin(toolParams, {
      apiKey: 'secret',
      model: 'gpt-image-1.5',
    })

    const functions = await tool.functions(fakeModel, { userId: 'user-1' })

    expect(functions.EditImage).toBeDefined()
  })

  test('legacy proxy-backed tool also enables editing for the latest OpenAI image model', async () => {
    const tool = new ImageGeneratorPlugin(toolParams, {
      apiKey: 'secret',
      model: 'gpt-image-2',
    })

    const functions = await tool.functions(fakeModel, { userId: 'user-1' })

    expect(functions.EditImage).toBeDefined()
  })

  test('legacy proxy-backed tool does not expose editing for unsupported models', async () => {
    const tool = new ImageGeneratorPlugin(toolParams, {
      apiKey: 'secret',
      model: 'dall-e-3',
      supportsEditing: true,
    })

    const functions = await tool.functions(fakeModel, { userId: 'user-1' })

    expect(functions.EditImage).toBeUndefined()
  })

  test('editing exposure is derived from the model capability list', () => {
    expect(shouldExposeImageEditingTool('gpt-image-2')).toBe(true)
    expect(shouldExposeImageEditingTool('gemini-3-pro-image-preview')).toBe(true)
    expect(shouldExposeImageEditingTool('dall-e-2')).toBe(false)
  })
})
