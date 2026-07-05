import { describe, expect, it, vi, beforeEach } from 'vitest'
import { ContextRetrievePlugin } from '@/backend/lib/tools/context-retrieve/implementation'
import type { ToolFunction, ToolInvokeParams, ToolParams } from '@/lib/chat/tools'
import { ChatState } from '@/backend/lib/chat/ChatState'
import { dtoMessageToDbMessage } from '@/backend/models/message'
import type * as dto from '@/types/dto'

const mockFileExecuteTakeFirst = vi.fn()
const mockBlobExecuteTakeFirst = vi.fn()
const mockCanAccessFile = vi.fn()
const mockExtractFromFile = vi.fn()

vi.mock('@/db/database', () => ({
  db: {
    selectFrom: (table: string) => {
      if (table === 'File') {
        return {
          selectAll: () => ({
            where: () => ({ where: () => ({ executeTakeFirst: mockFileExecuteTakeFirst }), executeTakeFirst: mockFileExecuteTakeFirst }),
          }),
        }
      }
      return {
        select: () => ({
          where: () => ({ executeTakeFirst: mockBlobExecuteTakeFirst }),
        }),
      }
    },
  },
}))

vi.mock('@/backend/lib/files/authorization', () => ({
  canAccessFile: (...args: unknown[]) => mockCanAccessFile(...args),
}))
vi.mock('@/lib/textextraction/cache', () => ({
  cachingExtractor: { extractFromFile: (...args: unknown[]) => mockExtractFromFile(...args) },
}))
beforeEach(() => {
  mockFileExecuteTakeFirst.mockReset()
  mockBlobExecuteTakeFirst.mockReset()
  mockCanAccessFile.mockReset().mockResolvedValue(true)
  mockExtractFromFile.mockReset()
})

const toolParams: ToolParams = { id: 't1', name: 'fm', provisioned: false, promptFragment: '' }
const textOnlyModel = { capabilities: { vision: false, supportedMedia: [] } } as any
const nativePdfModel = { capabilities: { vision: false, supportedMedia: ['application/pdf'] } } as any

function makeInvokeParams(
  params: Record<string, unknown>,
  messages: dto.Message[] = [],
  userId = 'user-1'
): ToolInvokeParams {
  return {
    llmModel: textOnlyModel,
    messages,
    assistantId: 'assistant-1',
    userId,
    params,
    uiLink: { debugMessage: vi.fn(), addCitations: vi.fn(), attachments: [], citations: [] },
  }
}

async function getFunctions() {
  const plugin = new ContextRetrievePlugin(toolParams, {})
  return (await plugin.functions({} as any, { userId: 'user-1' })) as Record<string, ToolFunction>
}

describe('ContextRetrievePlugin get_file', () => {
  it('returns an error when no file matches the given id', async () => {
    mockFileExecuteTakeFirst.mockResolvedValue(undefined)
    const fns = await getFunctions()

    const result = await fns.get_file.invoke(makeInvokeParams({ id: 'missing' }))

    expect(result).toEqual({ type: 'error-text', value: 'File not found' })
  })

  it('returns an error when the caller cannot access the file', async () => {
    mockFileExecuteTakeFirst.mockResolvedValue({
      id: 'f1',
      name: 'a.txt',
      type: 'text/plain',
      size: 10,
      path: 'files/a.txt',
    })
    mockCanAccessFile.mockResolvedValue(false)
    const fns = await getFunctions()

    const result = await fns.get_file.invoke(makeInvokeParams({ id: 'f1' }))

    expect(result).toEqual({ type: 'error-text', value: 'File not found' })
  })

  it('returns extracted text when found and accessible', async () => {
    mockFileExecuteTakeFirst.mockResolvedValue({
      id: 'f1',
      name: 'a.txt',
      type: 'text/plain',
      size: 10,
      fileBlobId: null,
      path: 'files/a.txt',
    })
    mockExtractFromFile.mockResolvedValue('text content')
    const fns = await getFunctions()

    const result = await fns.get_file.invoke(makeInvokeParams({ id: 'f1' }))

    expect(result).toEqual({ type: 'text', value: 'text content' })
  })

  it('marks file attachments as hidden when returning a binary file', async () => {
    mockFileExecuteTakeFirst.mockResolvedValue({
      id: 'f1',
      name: 'a.pdf',
      type: 'application/pdf',
      size: 10,
      fileBlobId: null,
      path: 'files/a.pdf',
    })
    mockExtractFromFile.mockResolvedValue('')
    const fns = await getFunctions()

    const result = await fns.get_file.invoke({
      ...makeInvokeParams({ id: 'f1' }),
      llmModel: nativePdfModel,
    })

    expect(result).toEqual({
      type: 'content',
      value: [
        {
          type: 'file',
          id: 'f1',
          size: 10,
          name: 'a.pdf',
          mimetype: 'application/pdf',
          uiHidden: true,
        },
      ],
    })
  })

  it('serializes uiHidden through the tool message persistence chain', async () => {
    mockFileExecuteTakeFirst.mockResolvedValue({
      id: 'f1',
      name: 'a.pdf',
      type: 'application/pdf',
      size: 10,
      fileBlobId: null,
      path: 'files/a.pdf',
    })
    mockExtractFromFile.mockResolvedValue('')
    const fns = await getFunctions()
    const result = await fns.get_file.invoke({
      ...makeInvokeParams({ id: 'f1' }),
      llmModel: nativePdfModel,
    })
    const userMessage: dto.UserMessage = {
      id: 'u1',
      role: 'user',
      conversationId: 'c1',
      parent: null,
      sentAt: '2026-07-05T00:00:00.000Z',
      content: 'read it',
      attachments: [],
    }
    const chatState = new ChatState([userMessage])
    chatState.appendMessage(chatState.createToolMsg())
    chatState.applyStreamPart({
      type: 'part',
      part: {
        type: 'tool-result',
        toolCallId: 'call-1',
        toolName: 'context-retrieve__get_file',
        result,
      },
    })

    const toolMessage = chatState.getLastMessageAssert<dto.ToolMessage>('tool')
    const dbMessage = dtoMessageToDbMessage(toolMessage)
    const serialized = JSON.parse(dbMessage.content) as Pick<dto.ToolMessage, 'parts'>

    expect(serialized.parts[0]?.type).toBe('tool-result')
    const part = serialized.parts[0] as dto.ToolCallResultPart
    expect(part.result).toEqual({
      type: 'content',
      value: [
        {
          type: 'file',
          id: 'f1',
          size: 10,
          name: 'a.pdf',
          mimetype: 'application/pdf',
          uiHidden: true,
        },
      ],
    })
  })
})

describe('ContextRetrievePlugin get_file blob resolution', () => {
  it('overrides size/encryption from the linked FileBlob row when fileBlobId is set', async () => {
    mockFileExecuteTakeFirst.mockResolvedValue({
      id: 'f1',
      name: 'a.txt',
      type: 'text/plain',
      size: 999,
      encryption: null,
      fileBlobId: 'blob-1',
      path: 'files/a.txt',
    })
    mockBlobExecuteTakeFirst.mockResolvedValue({ size: 42, encryption: 'pgp' })
    mockExtractFromFile.mockResolvedValue('extracted')

    const fns = await getFunctions()

    const result = await fns.get_file.invoke(makeInvokeParams({ id: 'f1' }))

    expect(result).toEqual({ type: 'text', value: 'extracted' })
  })

  it('falls back to the File row size/encryption when there is no linked blob', async () => {
    mockFileExecuteTakeFirst.mockResolvedValue({
      id: 'f1',
      name: 'a.txt',
      type: 'text/plain',
      size: 7,
      encryption: 'none',
      fileBlobId: null,
      path: 'files/a.txt',
    })

    const fns = await getFunctions()

    const result = await fns.get_file.invoke(makeInvokeParams({ id: 'f1' }))

    expect(result).toEqual({
      type: 'error-text',
      value: 'The content of the file "a.txt" with id f1 could not be extracted.',
    })
    expect(mockBlobExecuteTakeFirst).not.toHaveBeenCalled()
  })
})

const base = {
  conversationId: 'conv-1',
  parent: null,
  sentAt: '2026-07-05T00:00:00.000Z',
} as const

describe('ContextRetrievePlugin get_message', () => {
  it('returns the original, uncompressed content of a message from the live conversation history', async () => {
    const messages: dto.Message[] = [
      { ...base, id: 'u1', role: 'user', content: 'What is in report.pdf?', attachments: [] },
    ]
    const fns = await getFunctions()

    const result = await fns.get_message.invoke(makeInvokeParams({ id: 'u1' }, messages))

    expect(result).toEqual({ type: 'text', value: 'What is in report.pdf?' })
  })

  it('returns an error when no message in the conversation matches the id', async () => {
    const fns = await getFunctions()

    const result = await fns.get_message.invoke(makeInvokeParams({ id: 'missing' }, []))

    expect(result).toEqual({ type: 'error-text', value: 'Message not found' })
  })

  it('requires no DB access at all — it only looks at the messages already handed to invoke', async () => {
    const messages: dto.Message[] = [
      {
        ...base,
        id: 't1',
        role: 'tool',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'some_tool',
            result: { type: 'text', value: 'raw tool output' },
          },
        ],
      },
    ]
    const fns = await getFunctions()

    const result = await fns.get_message.invoke(makeInvokeParams({ id: 't1' }, messages))

    expect(result).toEqual({ type: 'text', value: 'Tool "some_tool" result: raw tool output' })
    expect(mockFileExecuteTakeFirst).not.toHaveBeenCalled()
  })
})

describe('ContextRetrievePlugin search', () => {
  it('finds a matching historical message and returns its id and a snippet', async () => {
    const messages: dto.Message[] = [
      { ...base, id: 'u1', role: 'user', content: 'the quarterly revenue figures are attached', attachments: [] },
      { ...base, id: 'u2', role: 'user', content: 'thanks', attachments: [] },
    ]
    const fns = await getFunctions()

    const result = await fns.search.invoke(makeInvokeParams({ query: 'revenue' }, messages))

    expect(result.type).toBe('text')
    expect((result as { value: string }).value).toContain('id: u1')
    expect((result as { value: string }).value).toContain('quarterly revenue figures')
  })

  it('returns a friendly message when nothing matches', async () => {
    const messages: dto.Message[] = [{ ...base, id: 'u1', role: 'user', content: 'hello', attachments: [] }]
    const fns = await getFunctions()

    const result = await fns.search.invoke(makeInvokeParams({ query: 'nonexistent' }, messages))

    expect(result).toEqual({ type: 'text', value: 'No messages matched "nonexistent".' })
  })

  it('rejects an empty query', async () => {
    const fns = await getFunctions()

    const result = await fns.search.invoke(makeInvokeParams({ query: '   ' }, []))

    expect(result).toEqual({ type: 'error-text', value: 'Empty search query' })
  })
})
