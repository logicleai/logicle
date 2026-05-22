import { describe, expect, test } from 'vitest'
import { ImageGeneratorPlugin } from '@/backend/lib/tools/imagegenerator/implementation'
import {
  GoogleImageGeneratorPlugin,
  OpenAiImageGeneratorPlugin,
  ReplicateImageGeneratorPlugin,
  TogetherImageGeneratorPlugin,
} from '@/backend/lib/tools/imagegenerator/direct-implementation'
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
  capabilities: { vision: true, function_calling: true, knowledge: false },
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

  test('legacy proxy-backed tool does not expose size controls', async () => {
    const tool = new ImageGeneratorPlugin(toolParams, {
      apiKey: 'secret',
      model: 'gpt-image-2',
    })

    const functions = await tool.functions(fakeModel, { userId: 'user-1' })
    const generateSizeSchema = (functions.GenerateImage as any).parameters?.properties?.size as
      | { enum?: string[] }
      | undefined
    const editSizeSchema = (functions.EditImage as any)?.parameters?.properties?.size as
      | { enum?: string[] }
      | undefined

    expect(generateSizeSchema).toBeUndefined()
    expect(editSizeSchema).toBeUndefined()
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

  test('direct OpenAI image tool exposes size controls for generation and editing', async () => {
    const tool = new OpenAiImageGeneratorPlugin(toolParams, {
      apiKey: 'secret',
      model: 'gpt-image-2',
    })

    const functions = await tool.functions(fakeModel, { userId: 'user-1' })
    const generateSizeSchema = (functions.GenerateImage as any).parameters?.properties?.size as
      | { enum?: string[] }
      | undefined
    const editSizeSchema = (functions.EditImage as any)?.parameters?.properties?.size as
      | { enum?: string[] }
      | undefined

    expect(generateSizeSchema?.enum).toEqual(['auto', '1024x1024', '1024x1536', '1536x1024'])
    expect(editSizeSchema?.enum).toEqual(['auto', '1024x1024', '1024x1536', '1536x1024'])
  })

  test('direct Together image tool exposes size controls for generation and editing', async () => {
    const tool = new TogetherImageGeneratorPlugin(toolParams, {
      apiKey: 'secret',
      model: 'FLUX.1-kontext-pro',
    })

    const functions = await tool.functions(fakeModel, { userId: 'user-1' })
    const generateSizeSchema = (functions.GenerateImage as any).parameters?.properties?.size as
      | { enum?: string[] }
      | undefined
    const editSizeSchema = (functions.EditImage as any)?.parameters?.properties?.size as
      | { enum?: string[] }
      | undefined

    expect(generateSizeSchema?.enum).toEqual(['auto', '1024x1024', '1024x1536', '1536x1024'])
    expect(editSizeSchema?.enum).toEqual(['auto', '1024x1024', '1024x1536', '1536x1024'])
  })

  test('direct Google image tool exposes aspect ratio controls', async () => {
    const tool = new GoogleImageGeneratorPlugin(toolParams, {
      apiKey: 'secret',
      model: 'gemini-3-pro-image-preview',
    })

    const functions = await tool.functions(fakeModel, { userId: 'user-1' })
    const generateSizeSchema = (functions.GenerateImage as any).parameters?.properties?.size as
      | { enum?: string[] }
      | undefined
    const editSizeSchema = (functions.EditImage as any)?.parameters?.properties?.size as
      | { enum?: string[] }
      | undefined
    const generateAspectRatioSchema = (functions.GenerateImage as any).parameters?.properties
      ?.aspectRatio as { enum?: string[] } | undefined
    const editAspectRatioSchema = (functions.EditImage as any)?.parameters?.properties
      ?.aspectRatio as { enum?: string[] } | undefined

    expect(generateSizeSchema).toBeUndefined()
    expect(editSizeSchema).toBeUndefined()
    expect(generateAspectRatioSchema?.enum).toEqual([
      '1:1',
      '2:3',
      '3:2',
      '3:4',
      '4:3',
      '4:5',
      '5:4',
      '9:16',
      '16:9',
      '21:9',
    ])
    expect(editAspectRatioSchema?.enum).toEqual([
      '1:1',
      '2:3',
      '3:2',
      '3:4',
      '4:3',
      '4:5',
      '5:4',
      '9:16',
      '16:9',
      '21:9',
    ])
  })

  test('direct Replicate image tool does not expose size controls when unsupported', async () => {
    const tool = new ReplicateImageGeneratorPlugin(toolParams, {
      apiKey: 'secret',
      model: 'owner/model:version',
      input: {},
    })

    const functions = await tool.functions(fakeModel, { userId: 'user-1' })
    const generateSizeSchema = (functions.GenerateImage as any).parameters?.properties?.size as
      | { enum?: string[] }
      | undefined

    expect(generateSizeSchema).toBeUndefined()
    expect(functions.EditImage).toBeUndefined()
  })
})
