import { describe, expect, it, vi, beforeEach } from 'vitest'
import { CodeInterpreter } from '@/backend/lib/tools/code_interpreter/implementation'
import type { ToolFunction, ToolInvokeParams, ToolParams } from '@/lib/chat/tools'

const mockExpandToolParameter = vi.fn()
const mockCanAccessFile = vi.fn()
const mockGetFileWithId = vi.fn()
const mockReadBuffer = vi.fn()
const mockMaterializeFile = vi.fn()
const mockMimeTypeOfFile = vi.fn()

const mockContainersCreate = vi.fn()
const mockContainerFilesCreate = vi.fn()
const mockContainerFilesList = vi.fn()
const mockContainerFileContentRetrieve = vi.fn()
const mockResponsesCreate = vi.fn()
const mockToFile = vi.fn()

vi.mock('@/backend/lib/tools/configSecrets', () => ({
  expandToolParameter: (...args: unknown[]) => mockExpandToolParameter(...args),
}))
vi.mock('@/backend/lib/files/authorization', () => ({
  canAccessFile: (...args: unknown[]) => mockCanAccessFile(...args),
}))
vi.mock('@/models/file', () => ({
  getFileWithId: (...args: unknown[]) => mockGetFileWithId(...args),
}))
vi.mock('@/lib/storage', () => ({
  storage: { readBuffer: (...args: unknown[]) => mockReadBuffer(...args) },
}))
vi.mock('@/backend/lib/files/materialize', () => ({
  materializeFile: (...args: unknown[]) => mockMaterializeFile(...args),
}))
vi.mock('@/lib/mimeTypes', () => ({
  mimeTypeOfFile: (...args: unknown[]) => mockMimeTypeOfFile(...args),
}))
vi.mock('@/lib/logging', () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}))
vi.mock('nanoid', () => ({ nanoid: () => 'fixedid' }))

vi.mock('openai', () => ({
  default: class {
    containers = {
      create: mockContainersCreate,
      files: {
        create: mockContainerFilesCreate,
        list: mockContainerFilesList,
        content: { retrieve: mockContainerFileContentRetrieve },
      },
    }
    responses = { create: mockResponsesCreate }
  },
  toFile: (...args: unknown[]) => mockToFile(...args),
}))

beforeEach(() => {
  mockExpandToolParameter.mockReset().mockResolvedValue('resolved-key')
  mockCanAccessFile.mockReset()
  mockGetFileWithId.mockReset()
  mockReadBuffer.mockReset()
  mockMaterializeFile.mockReset()
  mockMimeTypeOfFile.mockReset()
  mockContainersCreate.mockReset()
  mockContainerFilesCreate.mockReset()
  mockContainerFilesList.mockReset()
  mockContainerFileContentRetrieve.mockReset()
  mockResponsesCreate.mockReset()
  mockToFile.mockReset()
})

const toolParams: ToolParams = {
  id: 'tool-1',
  provisioned: false,
  promptFragment: '',
  name: 'code_interpreter',
}

function makeInvokeParams(params: Record<string, unknown>): ToolInvokeParams {
  return {
    llmModel: {} as any,
    messages: [],
    assistantId: 'assistant-1',
    userId: 'user-1',
    conversationId: 'conv-1',
    params,
    uiLink: {
      debugMessage: vi.fn(),
      addCitations: vi.fn(),
      attachments: [],
      citations: [],
    },
  }
}

function makeTool() {
  return new CodeInterpreter(toolParams, {
    executionMode: { apiKey: 'key-ref', model: undefined },
  } as any)
}

describe('CodeInterpreter create_container', () => {
  it('generates a default name via nanoid when none is provided', async () => {
    mockContainersCreate.mockResolvedValue({
      id: 'c1',
      name: 'logicle-ci-fixedid',
      status: 'running',
      created_at: 1,
      last_active_at: null,
      memory_limit: null,
      expires_after: null,
    })
    const tool = makeTool()
    const fns = (await tool.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>

    await fns.create_container.invoke(makeInvokeParams({}))

    expect(mockContainersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'logicle-ci-fixedid' })
    )
  })

  it('uses the provided name and normalizes null fields in the response', async () => {
    mockContainersCreate.mockResolvedValue({
      id: 'c1',
      name: 'my-container',
      status: 'running',
      created_at: 1,
      last_active_at: null,
      memory_limit: null,
      expires_after: null,
    })
    const tool = makeTool()
    const fns = (await tool.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>

    const result = await fns.create_container.invoke(makeInvokeParams({ name: 'my-container' }))

    expect(mockContainersCreate).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'my-container' })
    )
    expect(result).toEqual({
      type: 'json',
      value: {
        containerId: 'c1',
        container: {
          id: 'c1',
          name: 'my-container',
          status: 'running',
          created_at: 1,
          last_active_at: null,
          memory_limit: null,
          expires_after: null,
        },
      },
    })
  })
})

describe('CodeInterpreter upload_files', () => {
  it('rejects when containerId is missing', async () => {
    const tool = makeTool()
    const fns = (await tool.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>

    const result = await fns.upload_files.invoke(makeInvokeParams({ files: [{ fileId: 'f1' }] }))

    expect(result).toEqual({ type: 'error-text', value: 'containerId is required' })
  })

  it('rejects when files is empty', async () => {
    const tool = makeTool()
    const fns = (await tool.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>

    const result = await fns.upload_files.invoke(
      makeInvokeParams({ containerId: 'c1', files: [] })
    )

    expect(result).toEqual({ type: 'error-text', value: 'files must be a non-empty array' })
  })

  it('rejects an individual file the user is not authorized to access', async () => {
    mockCanAccessFile.mockResolvedValue(false)
    const tool = makeTool()
    const fns = (await tool.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>

    const result = await fns.upload_files.invoke(
      makeInvokeParams({ containerId: 'c1', files: [{ fileId: 'f1', path: '/f1.txt' }] })
    )

    expect(result).toEqual({
      type: 'error-text',
      value: 'You are not authorized to access file: f1',
    })
  })

  it('uploads authorized files into the container and reports their container file ids', async () => {
    mockCanAccessFile.mockResolvedValue(true)
    mockGetFileWithId.mockResolvedValue({ path: '/storage/f1', encryption: null, type: 'text/plain' })
    mockReadBuffer.mockResolvedValue(Buffer.from('content'))
    mockToFile.mockResolvedValue({ marker: 'uploaded-file' })
    mockContainerFilesCreate.mockResolvedValue({ id: 'cf1', path: '/f1.txt', bytes: 7 })

    const tool = makeTool()
    const fns = (await tool.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>

    const result = await fns.upload_files.invoke(
      makeInvokeParams({ containerId: 'c1', files: [{ fileId: 'f1', path: '/f1.txt' }] })
    )

    expect(mockContainerFilesCreate).toHaveBeenCalledWith('c1', { file: { marker: 'uploaded-file' } })
    expect(result).toEqual({
      type: 'json',
      value: {
        containerId: 'c1',
        files: [{ file_id: 'f1', container_file_id: 'cf1', path: '/f1.txt', bytes: 7 }],
      },
    })
  })
})

describe('CodeInterpreter execute', () => {
  it('rejects when containerId or code is missing', async () => {
    const tool = makeTool()
    const fns = (await tool.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>

    expect(await fns.execute.invoke(makeInvokeParams({ code: 'print(1)' }))).toEqual({
      type: 'error-text',
      value: 'containerId is required',
    })
    expect(await fns.execute.invoke(makeInvokeParams({ containerId: 'c1' }))).toEqual({
      type: 'error-text',
      value: 'code is required',
    })
  })

  it('extracts only container_file_citation annotations from message/output_text parts', async () => {
    mockResponsesCreate.mockResolvedValue({
      id: 'resp1',
      output_text: 'done',
      output: [
        { type: 'reasoning' },
        {
          type: 'message',
          content: [
            { type: 'refusal' },
            {
              type: 'output_text',
              annotations: [
                { type: 'url_citation' },
                { type: 'container_file_citation', container_id: 'c1', file_id: 'cf1', filename: 'out.csv' },
              ],
            },
          ],
        },
      ],
    })
    mockContainerFilesList.mockResolvedValue({
      [Symbol.asyncIterator]: async function* () {},
    })

    const tool = makeTool()
    const fns = (await tool.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>

    const result = await fns.execute.invoke(
      makeInvokeParams({ containerId: 'c1', code: 'print(1)' })
    )

    expect(result).toMatchObject({
      type: 'json',
      value: {
        file_citations: [{ container_id: 'c1', file_id: 'cf1', filename: 'out.csv' }],
      },
    })
  })

  it('falls back to the configured default model when none is provided in params', async () => {
    mockResponsesCreate.mockResolvedValue({ id: 'r', output_text: '', output: [] })
    mockContainerFilesList.mockResolvedValue({ [Symbol.asyncIterator]: async function* () {} })

    const tool = makeTool()
    const fns = (await tool.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>
    await fns.execute.invoke(makeInvokeParams({ containerId: 'c1', code: 'print(1)' }))

    expect(mockResponsesCreate).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4.1' }))
  })
})

describe('CodeInterpreter download_files', () => {
  it('rejects when containerId or files are missing', async () => {
    const tool = makeTool()
    const fns = (await tool.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>

    expect(await fns.download_files.invoke(makeInvokeParams({ files: [{ fileId: 'f' }] }))).toEqual({
      type: 'error-text',
      value: 'containerId is required',
    })
    expect(await fns.download_files.invoke(makeInvokeParams({ containerId: 'c1', files: [] }))).toEqual({
      type: 'error-text',
      value: 'file_ids must be a non-empty array',
    })
  })

  it('uses the response content-type header when present, ignoring the filename-based guess', async () => {
    mockContainerFileContentRetrieve.mockResolvedValue({
      arrayBuffer: async () => new TextEncoder().encode('data').buffer,
      headers: new Headers({ 'content-type': 'text/csv' }),
    })
    mockMaterializeFile.mockResolvedValue({ id: 'stored-1', type: 'text/csv', name: 'out.csv', size: 4 })

    const tool = makeTool()
    const fns = (await tool.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>

    await fns.download_files.invoke(
      makeInvokeParams({ containerId: 'c1', files: [{ fileId: 'cf1', path: '/mnt/data/out.csv' }] })
    )

    expect(mockMaterializeFile).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'text/csv' })
    )
    expect(mockMimeTypeOfFile).not.toHaveBeenCalled()
  })

  it('falls back to a filename-based mime type, then octet-stream, when there is no content-type header', async () => {
    mockContainerFileContentRetrieve.mockResolvedValue({
      arrayBuffer: async () => new TextEncoder().encode('data').buffer,
      headers: new Headers(),
    })
    mockMimeTypeOfFile.mockReturnValue('application/json')
    mockMaterializeFile.mockResolvedValue({ id: 'stored-1', type: 'application/json', name: 'out.json', size: 4 })

    const tool = makeTool()
    const fns = (await tool.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>

    await fns.download_files.invoke(
      makeInvokeParams({ containerId: 'c1', files: [{ fileId: 'cf1', path: '/mnt/data/out.json' }] })
    )

    expect(mockMaterializeFile).toHaveBeenCalledWith(
      expect.objectContaining({ mimeType: 'application/json' })
    )
  })

  it('prepends a stored-files summary and lists each downloaded file as an attachment', async () => {
    mockContainerFileContentRetrieve.mockResolvedValue({
      arrayBuffer: async () => new TextEncoder().encode('data').buffer,
      headers: new Headers({ 'content-type': 'text/csv' }),
    })
    mockMaterializeFile.mockResolvedValue({ id: 'stored-1', type: 'text/csv', name: 'out.csv', size: 4 })

    const tool = makeTool()
    const fns = (await tool.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>

    const result = await fns.download_files.invoke(
      makeInvokeParams({ containerId: 'c1', files: [{ fileId: 'cf1', path: '/mnt/data/out.csv' }] })
    )

    expect(result.type).toBe('content')
    expect((result as any).value[0]).toMatchObject({ type: 'text' })
    expect((result as any).value[1]).toMatchObject({
      type: 'file',
      id: 'stored-1',
      name: 'out.csv',
      mimetype: 'text/csv',
    })
  })
})
