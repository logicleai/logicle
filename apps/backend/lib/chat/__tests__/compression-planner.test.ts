import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import * as dto from '@/types/dto'
import { LlmModel } from '@/lib/chat/models'
import { buildHistorySegments } from '@/backend/lib/chat/preamble'
import {
  planMessageCompression,
  applyCompressionPlan,
  warmCompressionCache,
  resolveCompressionTriggerTokens,
  DEFAULT_COMPRESSION_TRIGGER_TOKENS,
} from '@/backend/lib/chat/compression-planner'

const { mockExtractFromFile } = vi.hoisted(() => ({ mockExtractFromFile: vi.fn() }))
const { mockReadBuffer } = vi.hoisted(() => ({ mockReadBuffer: vi.fn() }))
const { mockGetCompressedMessage, mockSaveCompressedMessage } = vi.hoisted(() => ({
  mockGetCompressedMessage: vi.fn(async () => undefined),
  mockSaveCompressedMessage: vi.fn(async () => undefined),
}))

vi.mock('@/models/file', () => ({
  getFileWithId: vi.fn(async (id: string) => {
    const isImage = id === 'file-horse'
    return {
      id,
      fileBlobId: `blob-${id}`,
      name: isImage ? 'horse.png' : 'documento_semplice.docx',
      origin: 'generated',
      type: isImage ? 'image/png' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      path: isImage ? '/tmp/horse.png' : '/tmp/documento_semplice.docx',
      encryption: null,
      size: isImage ? 1594448 : 3173,
    }
  }),
}))

vi.mock('@/models/compressed-message', () => ({
  getCompressedMessage: mockGetCompressedMessage,
  saveCompressedMessage: mockSaveCompressedMessage,
}))

vi.mock('@/lib/textextraction/cache', () => ({
  cachingExtractor: { extractFromFile: mockExtractFromFile },
}))

vi.mock('@/lib/storage', () => ({
  storage: { readBuffer: mockReadBuffer },
}))

const base = {
  conversationId: 'conv-docx',
  parent: null,
  sentAt: '2026-07-05T00:00:00.000Z',
} as const

const docxMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

const modelWithoutDocxNativeSupport: LlmModel = {
  id: 'test-openai',
  model: 'test-openai',
  name: 'Test OpenAI',
  provider: 'openai',
  owned_by: 'openai',
  description: '',
  context_length: 100000,
  capabilities: {
    vision: true,
    function_calling: true,
    supportedMedia: ['application/pdf', 'image/png', 'image/jpeg'],
  },
}

const languageModel = { provider: 'openai.responses' } as LanguageModelV3

const makeGeneratedDocxHistory = (): dto.Message[] => [
  { ...base, id: 'u-create-docx', role: 'user', content: 'Puoi generare un file word', attachments: [] },
  {
    ...base,
    id: 'a-tool-call',
    role: 'assistant',
    parts: [
      {
        type: 'tool-call',
        toolCallId: 'call-docx',
        toolName: 'office_script',
        args: {
          code: [
            'const h = createDocx({',
            '  title: "Documento semplice",',
            '  paragraphs: [',
            '    { text: "Documento semplice", style: "Title" },',
            '    { text: "Questo e un semplice documento Word generato automaticamente." },',
            '    { text: "Contiene un titolo e un breve paragrafo di esempio." }',
            '  ]',
            '});',
            'publishResource(saveDocument(h), "documento_semplice.docx");',
          ].join('\n'),
        },
      },
    ],
  },
  {
    ...base,
    id: 't-docx',
    role: 'tool',
    parts: [
      {
        type: 'tool-result',
        toolCallId: 'call-docx',
        toolName: 'office_script',
        result: {
          type: 'content',
          value: [
            { type: 'text', text: 'Published 1 resource(s): documento_semplice.docx' },
            { type: 'file', id: 'file-docx', mimetype: docxMime, name: 'documento_semplice.docx', size: 3173 },
          ],
        },
      },
    ],
  },
  { ...base, id: 'a-final', role: 'assistant', parts: [{ type: 'text', text: 'Hei, ho generato un documento word' }] },
  { ...base, id: 'u-ask-content', role: 'user', content: "E cosa c'e dentro?", attachments: [] },
]

const makeGeneratedHorseImageHistory = (): dto.Message[] => [
  { ...base, id: 'u-create-image', role: 'user', content: 'Genera immagine di un cavallo', attachments: [] },
  {
    ...base,
    id: 'a-image-tool-call',
    role: 'assistant',
    parts: [
      {
        type: 'tool-call',
        toolCallId: 'call-image',
        toolName: 'Dalle__GenerateImage',
        args: { prompt: 'Un cavallo realistico' },
      },
    ],
  },
  {
    ...base,
    id: 't-image',
    role: 'tool',
    parts: [
      {
        type: 'tool-result',
        toolCallId: 'call-image',
        toolName: 'Dalle__GenerateImage',
        result: {
          type: 'content',
          value: [
            { type: 'text', text: 'The tool displayed 1 images. The images are already plainly visible.' },
            { type: 'file', id: 'file-horse', mimetype: 'image/png', name: 'horse.png', size: 1594448 },
          ],
        },
      },
    ],
  },
  { ...base, id: 'a-image-final', role: 'assistant', parts: [{ type: 'text', text: 'Hei, ho generato una immagine di un cavallo' }] },
  { ...base, id: 'u-ask-hooves', role: 'user', content: 'Di che colore erano gli zoccoli?', attachments: [] },
]

async function compress(messages: dto.Message[], preset: dto.ContextCompressionPreset = 'conservative') {
  const decisions = planMessageCompression(messages, preset)
  return { decisions, compressed: await applyCompressionPlan(messages, decisions) }
}

describe('planMessageCompression', () => {
  test('keeps the current turn full and marks historical tool result for summary', () => {
    const decisions = planMessageCompression(makeGeneratedDocxHistory(), 'conservative')
    const byId = new Map(decisions.map((d) => [d.messageId, d]))
    expect(byId.get('u-ask-content')?.policy).toBe('full')
    expect(byId.get('t-docx')?.policy).toBe('summary')
    expect(byId.get('t-docx')?.reason).toContain('recoverable file')
  })

  test('the current turn is never compressed, under any preset', () => {
    const messages: dto.Message[] = [
      {
        ...base,
        id: 'u1',
        role: 'user',
        content: 'here',
        attachments: [{ id: 'f1', name: 'a.pdf', mimetype: 'application/pdf', size: 10 }],
      },
    ]
    for (const preset of ['conservative', 'aggressive'] as const) {
      const decisions = planMessageCompression(messages, preset)
      expect(decisions[0]!.policy).toBe('full')
      expect(decisions[0]!.reason).toBe('current turn is never compressed')
    }
  })

  test('a historical attachment is still summarized once a later turn starts', () => {
    const messages: dto.Message[] = [
      {
        ...base,
        id: 'u1',
        role: 'user',
        content: 'here',
        attachments: [{ id: 'f1', name: 'a.pdf', mimetype: 'application/pdf', size: 10 }],
      },
      { ...base, id: 'u2', role: 'user', content: 'next question', attachments: [] },
    ]
    const decisions = planMessageCompression(messages, 'conservative')
    expect(decisions[0]!.policy).toBe('summary')
    expect(decisions[1]!.policy).toBe('full')
  })

  test('a historical decision does not depend on what the current user message says (stable for prompt caching)', () => {
    const withUnrelatedFollowUp = makeGeneratedDocxHistory()
    const withNamedFollowUp = makeGeneratedDocxHistory()
    withNamedFollowUp[withNamedFollowUp.length - 1] = {
      ...(withNamedFollowUp[withNamedFollowUp.length - 1] as dto.UserMessage),
      content: 'tell me about documento_semplice.docx',
    }

    const decisionsA = planMessageCompression(withUnrelatedFollowUp, 'conservative')
    const decisionsB = planMessageCompression(withNamedFollowUp, 'conservative')

    expect(decisionsA.find((d) => d.messageId === 't-docx')?.policy).toBe('summary')
    expect(decisionsB.find((d) => d.messageId === 't-docx')?.policy).toBe('summary')
  })

  test('large historical tool text output is marked for summary even without files', () => {
    const messages: dto.Message[] = [
      { ...base, id: 'u1', role: 'user', content: 'run a report', attachments: [] },
      {
        ...base,
        id: 't1',
        role: 'tool',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'report',
            result: { type: 'text', value: 'x'.repeat(5000) },
          },
        ],
      },
      { ...base, id: 'u2', role: 'user', content: 'thanks, next question', attachments: [] },
    ]
    const decisions = planMessageCompression(messages, 'conservative')
    expect(decisions.find((d) => d.messageId === 't1')?.policy).toBe('summary')
  })

  test('aggressive preset lowers the historical large-text threshold', () => {
    const messages: dto.Message[] = [
      { ...base, id: 'u1', role: 'user', content: 'run a report', attachments: [] },
      {
        ...base,
        id: 't1',
        role: 'tool',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'report',
            result: { type: 'text', value: 'x'.repeat(1200) },
          },
        ],
      },
      { ...base, id: 'u2', role: 'user', content: 'thanks, next question', attachments: [] },
    ]
    const conservative = planMessageCompression(messages, 'conservative')
    const aggressive = planMessageCompression(messages, 'aggressive')
    expect(conservative.find((d) => d.messageId === 't1')?.policy).toBe('full')
    expect(aggressive.find((d) => d.messageId === 't1')?.policy).toBe('summary')
  })
})

describe('resolveCompressionTriggerTokens', () => {
  test('a low or unset assistant threshold never drops below the default floor', () => {
    expect(resolveCompressionTriggerTokens(undefined)).toBe(DEFAULT_COMPRESSION_TRIGGER_TOKENS)
    expect(resolveCompressionTriggerTokens(100)).toBe(DEFAULT_COMPRESSION_TRIGGER_TOKENS)
  })

  test('an assistant threshold above the floor is honored', () => {
    expect(resolveCompressionTriggerTokens(DEFAULT_COMPRESSION_TRIGGER_TOKENS + 5000)).toBe(
      DEFAULT_COMPRESSION_TRIGGER_TOKENS + 5000
    )
  })
})

describe('applyCompressionPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCompressedMessage.mockResolvedValue(undefined)
  })

  test('compressed previous turn redacts duplicated document text, extracts a plain-text preview, and adds a file + message recovery reference', async () => {
    mockExtractFromFile.mockResolvedValueOnce('Documento semplice: contains a title and one paragraph.')

    const { compressed } = await compress(makeGeneratedDocxHistory())

    const segments = await buildHistorySegments(compressed, modelWithoutDocxNativeSupport, languageModel)
    const promptText = JSON.stringify(segments.map((segment) => segment.message))

    expect(promptText).toContain('File available on demand: documento_semplice.docx')
    expect(promptText).toContain('id: file-docx')
    expect(promptText).toContain(docxMime)
    expect(promptText).toContain('context-retrieve.get_file')
    expect(promptText).toContain('summary: Documento semplice: contains a title and one paragraph.')
    expect(promptText).toContain('[Tool output summarized for context efficiency.]')
    expect(promptText).toContain('context-retrieve.get_message with id: t-docx')
    expect(promptText).not.toContain('Published 1 resource(s): documento_semplice.docx')
    expect(promptText).not.toContain('Questo e un semplice documento Word generato automaticamente.')
    expect(promptText).toContain('[redacted: content available via context-retrieve, see summarized result]')
    expect(mockExtractFromFile).toHaveBeenCalledTimes(1)
  })

  test('uncompressed generated DOCX tool result is still converted through text extraction when not natively supported', async () => {
    mockExtractFromFile.mockResolvedValueOnce('EXTRACTED DOCX CONTENT')

    const segments = await buildHistorySegments(makeGeneratedDocxHistory(), modelWithoutDocxNativeSupport, languageModel)
    const promptText = JSON.stringify(segments.map((segment) => segment.message))

    expect(promptText).toContain('Attachment 1: documento_semplice.docx')
    expect(promptText).toContain('EXTRACTED DOCX CONTENT')
    expect(mockExtractFromFile).toHaveBeenCalledTimes(1)
  })

  test('compressed generated image tool result never upgrades to image-data / native bytes, and never calls a model to describe it', async () => {
    const { compressed } = await compress(makeGeneratedHorseImageHistory())

    const segments = await buildHistorySegments(compressed, modelWithoutDocxNativeSupport, languageModel)
    const promptText = JSON.stringify(segments.map((segment) => segment.message))

    expect(promptText).toContain('File available on demand: horse.png')
    expect(promptText).toContain('id: file-horse')
    expect(promptText).toContain('summary: Image file; no text preview available.')
    expect(promptText).toContain('[Tool output summarized for context efficiency.]')
    expect(promptText).toContain('context-retrieve.get_message with id: t-image')
    expect(promptText).not.toContain('Attachment 1: horse.png')
    expect(promptText).not.toContain('The tool displayed 1 images')
    expect(promptText).not.toContain('image-data')
    expect(mockReadBuffer).not.toHaveBeenCalled()
    expect(mockExtractFromFile).not.toHaveBeenCalled()
  })

  test('uncompressed generated image tool result still sends image bytes (provider adapters do not change full-policy semantics)', async () => {
    mockReadBuffer.mockResolvedValueOnce(Buffer.from('horse-image-bytes'))

    const segments = await buildHistorySegments(makeGeneratedHorseImageHistory(), modelWithoutDocxNativeSupport, languageModel)
    const promptText = JSON.stringify(segments.map((segment) => segment.message))

    expect(promptText).toContain('Attachment 1: horse.png')
    expect(promptText).toContain('image-data')
    expect(promptText).toContain(Buffer.from('horse-image-bytes').toString('base64'))
    expect(mockReadBuffer).toHaveBeenCalledTimes(1)
  })

  test('failed text extraction falls back to a deterministic minimal summary instead of blocking compaction', async () => {
    mockExtractFromFile.mockResolvedValueOnce(undefined)
    const bare: dto.Message[] = [
      { ...base, id: 'u1', role: 'user', content: 'go', attachments: [] },
      {
        ...base,
        id: 't1',
        role: 'tool',
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'gen',
            result: {
              type: 'content',
              value: [{ type: 'file', id: 'file-docx', mimetype: docxMime, name: 'unknown.docx', size: 10 }],
            },
          },
        ],
      },
      { ...base, id: 'u2', role: 'user', content: 'next', attachments: [] },
    ]
    const decisions = planMessageCompression(bare, 'conservative')
    const result = await applyCompressionPlan(bare, decisions)
    const toolMessage = result.find((m) => m.id === 't1') as dto.ToolMessage
    const text = (toolMessage.parts[0] as dto.ToolCallResultPart).result
    expect(text.type).toBe('text')
    expect((text as { value: string }).value).toContain('No extractable text preview available for this file type.')
    expect((text as { value: string }).value).toContain('File available on demand: unknown.docx')
    expect((text as { value: string }).value).toContain('[Tool output summarized for context efficiency.]')
    expect((text as { value: string }).value).toContain('context-retrieve.get_message with id: t1')
  })

  test('user attachments summarized on a historical turn strip raw attachments, extract a plain-text preview, and add file + message recovery references', async () => {
    mockExtractFromFile.mockResolvedValueOnce('The report covers Q1 revenue.')
    const messages: dto.Message[] = [
      {
        ...base,
        id: 'u1',
        role: 'user',
        content: 'Please inspect this file.',
        attachments: [{ id: 'file-123', mimetype: 'application/pdf', name: 'report.pdf', size: 1024 }],
      },
      { ...base, id: 'u2', role: 'user', content: 'What is in the file?', attachments: [] },
    ]
    const decisions = planMessageCompression(messages, 'conservative')
    const compressed = await applyCompressionPlan(messages, decisions)

    const first = compressed[0] as dto.UserMessage
    expect(first.attachments).toEqual([])
    expect(first.content).toContain('File available on demand: report.pdf')
    expect(first.content).toContain('id: file-123')
    expect(first.content).toContain('context-retrieve.get_file')
    expect(first.content).toContain('summary: The report covers Q1 revenue.')
    expect(first.content).toContain('context-retrieve.get_message with id: u1')
  })

  test('a long historical user message with no attachment is still recoverable by id under the aggressive preset', async () => {
    const messages: dto.Message[] = [
      { ...base, id: 'u1', role: 'user', content: 'x'.repeat(1200), attachments: [] },
      { ...base, id: 'u2', role: 'user', content: 'next question', attachments: [] },
    ]
    const decisions = planMessageCompression(messages, 'aggressive')
    const compressed = await applyCompressionPlan(messages, decisions)

    const first = compressed[0] as dto.UserMessage
    expect(first.content).toContain('…[truncated;')
    expect(first.content).toContain('context-retrieve.get_message with id: u1')
  })
})

describe('warmCompressionCache', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockGetCompressedMessage.mockResolvedValue(undefined)
  })

  test('eagerly builds and caches the compressed form for a message with attachments as soon as it is saved', async () => {
    mockExtractFromFile.mockResolvedValueOnce('Quarterly figures.')
    const message: dto.UserMessage = {
      ...base,
      id: 'u1',
      role: 'user',
      content: 'here is the file',
      attachments: [{ id: 'file-123', mimetype: 'application/pdf', name: 'report.pdf', size: 1024 }],
    }

    await warmCompressionCache(message)

    expect(mockSaveCompressedMessage).toHaveBeenCalledTimes(1)
    expect(mockSaveCompressedMessage).toHaveBeenCalledWith(
      expect.objectContaining({ sourceMessageId: 'u1' })
    )
  })

  test('does nothing for messages with no compressible content', async () => {
    const message: dto.UserMessage = { ...base, id: 'u1', role: 'user', content: 'hi', attachments: [] }

    await warmCompressionCache(message)

    expect(mockSaveCompressedMessage).not.toHaveBeenCalled()
    expect(mockGetCompressedMessage).not.toHaveBeenCalled()
  })

  test('never throws, even if the underlying build fails', async () => {
    mockGetCompressedMessage.mockRejectedValueOnce(new Error('db down'))
    const message: dto.UserMessage = {
      ...base,
      id: 'u1',
      role: 'user',
      content: 'here',
      attachments: [{ id: 'file-123', mimetype: 'application/pdf', name: 'report.pdf', size: 1024 }],
    }

    await expect(warmCompressionCache(message)).resolves.toBeUndefined()
  })

  test('a concurrent applyCompressionPlan build for the same message joins the warm-up in flight instead of duplicating work', async () => {
    mockExtractFromFile.mockResolvedValueOnce('Quarterly figures.')

    const message: dto.UserMessage = {
      ...base,
      id: 'u-concurrent',
      role: 'user',
      content: 'here is the file',
      attachments: [{ id: 'file-123', mimetype: 'application/pdf', name: 'report.pdf', size: 1024 }],
    }
    const messages: dto.Message[] = [message, { ...base, id: 'u-next', role: 'user', content: 'next', attachments: [] }]

    // Fired the way models/message.ts fires it: right away, unawaited.
    const warmPromise = warmCompressionCache(message)
    // A concurrent request's prompt build decides, independently, that it needs the same message
    // compressed before the warm-up above has finished.
    const decisions = planMessageCompression(messages, 'conservative')
    const applyPromise = applyCompressionPlan(messages, decisions)

    await Promise.all([warmPromise, applyPromise])

    expect(mockExtractFromFile).toHaveBeenCalledTimes(1)
    expect(mockSaveCompressedMessage).toHaveBeenCalledTimes(1)
  })
})
