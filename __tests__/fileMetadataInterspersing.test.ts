/**
 * Tests for the INTERSPERSE_FILE_METADATA feature (issue #251).
 *
 * Covers:
 *  - fileDescriptorText: all naming/fallback rules
 *  - projectMessageForEstimation: classic vs interspersed projection
 *  - dtoMessageToLlmMessage: content ordering in interspersed mode
 *  - preparePreamblePlan: knowledge segment structure in interspersed mode
 *  - Token estimation alignment for user attachments and knowledge files
 */
import { beforeEach, describe, expect, test, vi } from 'vitest'
import type { LlmModelCapabilities } from '@/lib/chat/models'
import type * as dto from '@/types/dto'
import type { MessageProjectionItem } from '@/backend/lib/chat/message-projection'

const asText = (item: MessageProjectionItem | undefined) => {
  if (item?.kind !== 'text') throw new Error(`Expected text item, got ${item?.kind}`)
  return item
}

// ---------------------------------------------------------------------------
// Mock infrastructure (mirrors conversion.test.ts pattern)
// ---------------------------------------------------------------------------
const ensureFileAnalysis = vi.fn()
const readBuffer = vi.fn()
const extractFromFile = vi.fn()
const getFileWithId = vi.fn()
const warn = vi.fn()
const info = vi.fn()

vi.mock('@/models/file', () => ({ getFileWithId }))
vi.mock('@/lib/file-analysis', () => ({
  ensureFileAnalysis,
  isReadyFileAnalysis: (analysis: dto.FileAnalysis | undefined) =>
    analysis?.status === 'ready' && analysis.payload !== null,
}))
vi.mock('@/lib/storage', () => ({ storage: { readBuffer } }))
vi.mock('@/lib/textextraction/cache', () => ({ cachingExtractor: { extractFromFile } }))
vi.mock('@/lib/logging', () => ({ logger: { info, warn } }))

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------
const visionCapabilities: LlmModelCapabilities = {
  vision: true,
  function_calling: true,
  supportedMedia: ['image/png', 'image/jpeg'],
}

const noVisionCapabilities: LlmModelCapabilities = {
  vision: false,
  function_calling: true,
  supportedMedia: [],
}

const pngFile = {
  fileBlobId: 'blob-png',
  id: 'img-1',
  name: 'screenshot.png',
  origin: null,
  ownerType: 'USER' as const,
  ownerId: 'u1',
  path: 'files/screenshot.png',
  type: 'image/png',
  size: 9321,
  createdAt: new Date().toISOString(),
  encrypted: 0 as const,
}

const jpgFile = {
  ...pngFile,
  fileBlobId: 'blob-jpg',
  id: 'img-2',
  name: 'photo.jpg',
  path: 'files/photo.jpg',
  type: 'image/jpeg',
  size: 45678,
}

const pdfFile = {
  fileBlobId: 'blob-pdf',
  id: 'pdf-1',
  name: 'report.pdf',
  origin: null,
  ownerType: 'USER' as const,
  ownerId: 'u1',
  path: 'files/report.pdf',
  type: 'application/pdf',
  size: 248731,
  createdAt: new Date().toISOString(),
  encrypted: 0 as const,
}

// ---------------------------------------------------------------------------
// 1. fileDescriptorText
// ---------------------------------------------------------------------------
describe('fileDescriptorText', () => {
  test('uses file name when present', async () => {
    const { fileDescriptorText } = await import('@/backend/lib/chat/message-projection')
    expect(fileDescriptorText('invoice.pdf', 'f1', 'application/pdf', 1234, 1, 'Attachment')).toBe(
      'Attachment 1: invoice.pdf (id f1, application/pdf, 1234 bytes)'
    )
  })

  test('uses Knowledge label', async () => {
    const { fileDescriptorText } = await import('@/backend/lib/chat/message-projection')
    expect(fileDescriptorText('handbook.pdf', 'k1', 'application/pdf', 99, 3, 'Knowledge')).toBe(
      'Knowledge 3: handbook.pdf (id k1, application/pdf, 99 bytes)'
    )
  })

  test('falls back to "pasted image" when name is absent and mime is image', async () => {
    const { fileDescriptorText } = await import('@/backend/lib/chat/message-projection')
    expect(fileDescriptorText(undefined, 'f2', 'image/png', 5000, 2, 'Attachment')).toBe(
      'Attachment 2: pasted image (id f2, image/png, 5000 bytes)'
    )
    expect(fileDescriptorText('', 'f3', 'image/jpeg', 5000, 3, 'Attachment')).toBe(
      'Attachment 3: pasted image (id f3, image/jpeg, 5000 bytes)'
    )
    expect(fileDescriptorText('   ', 'f4', 'image/webp', 5000, 4, 'Attachment')).toBe(
      'Attachment 4: pasted image (id f4, image/webp, 5000 bytes)'
    )
  })

  test('falls back to "pasted" when name is absent and mime is NOT an image', async () => {
    const { fileDescriptorText } = await import('@/backend/lib/chat/message-projection')
    expect(fileDescriptorText(undefined, 'f5', 'application/pdf', 999, 1, 'Attachment')).toBe(
      'Attachment 1: pasted (id f5, application/pdf, 999 bytes)'
    )
    expect(fileDescriptorText(null, 'f6', 'text/plain', 100, 2, 'Attachment')).toBe(
      'Attachment 2: pasted (id f6, text/plain, 100 bytes)'
    )
  })

  test('trims whitespace-only names', async () => {
    const { fileDescriptorText } = await import('@/backend/lib/chat/message-projection')
    expect(fileDescriptorText('  ', 'f7', 'application/pdf', 1, 1, 'Attachment')).toBe(
      'Attachment 1: pasted (id f7, application/pdf, 1 bytes)'
    )
  })

  test('ordinal is reflected correctly', async () => {
    const { fileDescriptorText } = await import('@/backend/lib/chat/message-projection')
    expect(fileDescriptorText('a.png', 'x', 'image/png', 1, 7, 'Knowledge')).toContain('Knowledge 7:')
    expect(fileDescriptorText('a.png', 'x', 'image/png', 1, 42, 'Attachment')).toContain('Attachment 42:')
  })
})

// ---------------------------------------------------------------------------
// 2. projectMessageForEstimation — classic mode (intersperseFileMetadata=false)
// ---------------------------------------------------------------------------
describe('projectMessageForEstimation — classic mode', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  test('single attachment: global descriptor then attachment item', async () => {
    const { projectMessageForEstimation } = await import('@/backend/lib/chat/message-projection')
    const msg: dto.UserMessage = {
      id: 'm1',
      conversationId: 'c1',
      parent: null,
      sentAt: new Date().toISOString(),
      citations: [],
      role: 'user',
      content: 'hello',
      attachments: [{ id: 'img-1', name: 'screenshot.png', mimetype: 'image/png', size: 9321 }],
    }
    const projection = projectMessageForEstimation(msg, false)
    expect(projection.role).toBe('user')
    const textItems = projection.items.filter((i) => i.kind === 'text')
    const attachmentItems = projection.items.filter((i) => i.kind === 'attachment')
    // One content text + one global descriptor text
    expect(textItems).toHaveLength(2)
    expect(textItems[0]).toMatchObject({ source: 'content', text: 'hello' })
    expect(textItems[1]).toMatchObject({ source: 'attachment_descriptor' })
    expect(asText(textItems[1]).text).toContain('screenshot.png')
    // Attachments come last
    expect(attachmentItems).toHaveLength(1)
    const lastItem = projection.items[projection.items.length - 1]
    expect(lastItem?.kind).toBe('attachment')
  })

  test('two attachments: single global descriptor, attachments appended in order', async () => {
    const { projectMessageForEstimation } = await import('@/backend/lib/chat/message-projection')
    const msg: dto.UserMessage = {
      id: 'm2',
      conversationId: 'c1',
      parent: null,
      sentAt: new Date().toISOString(),
      citations: [],
      role: 'user',
      content: '',
      attachments: [
        { id: 'img-1', name: 'a.png', mimetype: 'image/png', size: 100 },
        { id: 'img-2', name: 'b.jpg', mimetype: 'image/jpeg', size: 200 },
      ],
    }
    const projection = projectMessageForEstimation(msg, false)
    const descriptorItems = projection.items.filter(
      (i) => i.kind === 'text' && i.source === 'attachment_descriptor'
    )
    const attachmentItems = projection.items.filter((i) => i.kind === 'attachment')
    // One aggregated descriptor
    expect(descriptorItems).toHaveLength(1)
    // Both attachments in order
    expect(attachmentItems).toHaveLength(2)
    expect(attachmentItems[0]).toMatchObject({ attachment: { id: 'img-1' } })
    expect(attachmentItems[1]).toMatchObject({ attachment: { id: 'img-2' } })
  })
})

// ---------------------------------------------------------------------------
// 3. projectMessageForEstimation — interspersed mode (intersperseFileMetadata=true)
// ---------------------------------------------------------------------------
describe('projectMessageForEstimation — interspersed mode', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  test('single attachment: individual descriptor immediately before attachment', async () => {
    const { projectMessageForEstimation } = await import('@/backend/lib/chat/message-projection')
    const msg: dto.UserMessage = {
      id: 'm3',
      conversationId: 'c1',
      parent: null,
      sentAt: new Date().toISOString(),
      citations: [],
      role: 'user',
      content: 'check this',
      attachments: [{ id: 'img-1', name: 'screenshot.png', mimetype: 'image/png', size: 9321 }],
    }
    const projection = projectMessageForEstimation(msg, true)
    // Items should be: [content text, descriptor text, attachment]
    expect(projection.items).toHaveLength(3)
    expect(projection.items[0]).toMatchObject({ kind: 'text', source: 'content', text: 'check this' })
    expect(projection.items[1]).toMatchObject({ kind: 'text', source: 'attachment_descriptor' })
    expect(asText(projection.items[1]).text).toBe('Attachment 1: screenshot.png (id img-1, image/png, 9321 bytes)')
    expect(projection.items[2]).toMatchObject({ kind: 'attachment', attachment: { id: 'img-1' } })
  })

  test('two attachments: two (descriptor, attachment) pairs in order', async () => {
    const { projectMessageForEstimation } = await import('@/backend/lib/chat/message-projection')
    const msg: dto.UserMessage = {
      id: 'm4',
      conversationId: 'c1',
      parent: null,
      sentAt: new Date().toISOString(),
      citations: [],
      role: 'user',
      content: '',
      attachments: [
        { id: 'img-1', name: 'a.png', mimetype: 'image/png', size: 100 },
        { id: 'img-2', name: 'b.jpg', mimetype: 'image/jpeg', size: 200 },
      ],
    }
    const projection = projectMessageForEstimation(msg, true)
    // Items: [desc1, att1, desc2, att2] (no content text since content='')
    expect(projection.items).toHaveLength(4)
    expect(projection.items[0]).toMatchObject({ kind: 'text', source: 'attachment_descriptor' })
    expect(asText(projection.items[0]).text).toContain('Attachment 1:')
    expect(asText(projection.items[0]).text).toContain('a.png')
    expect(projection.items[1]).toMatchObject({ kind: 'attachment', attachment: { id: 'img-1' } })
    expect(projection.items[2]).toMatchObject({ kind: 'text', source: 'attachment_descriptor' })
    expect(asText(projection.items[2]).text).toContain('Attachment 2:')
    expect(asText(projection.items[2]).text).toContain('b.jpg')
    expect(projection.items[3]).toMatchObject({ kind: 'attachment', attachment: { id: 'img-2' } })
  })

  test('unnamed pasted image gets "pasted image" descriptor', async () => {
    const { projectMessageForEstimation } = await import('@/backend/lib/chat/message-projection')
    const msg: dto.UserMessage = {
      id: 'm5',
      conversationId: 'c1',
      parent: null,
      sentAt: new Date().toISOString(),
      citations: [],
      role: 'user',
      content: '',
      attachments: [{ id: 'paste-1', name: '', mimetype: 'image/png', size: 50000 }],
    }
    const projection = projectMessageForEstimation(msg, true)
    expect(asText(projection.items[0]).text).toContain('pasted image')
    expect(asText(projection.items[0]).text).toContain('id paste-1')
  })

  test('unnamed non-image gets "pasted" descriptor', async () => {
    const { projectMessageForEstimation } = await import('@/backend/lib/chat/message-projection')
    const msg: dto.UserMessage = {
      id: 'm6',
      conversationId: 'c1',
      parent: null,
      sentAt: new Date().toISOString(),
      citations: [],
      role: 'user',
      content: '',
      attachments: [{ id: 'paste-2', name: '', mimetype: 'application/pdf', size: 10000 }],
    }
    const projection = projectMessageForEstimation(msg, true)
    expect(asText(projection.items[0]).text).toContain('Attachment 1: pasted (id paste-2')
  })

  test('no attachments: behaves identically in both modes', async () => {
    const { projectMessageForEstimation } = await import('@/backend/lib/chat/message-projection')
    const msg: dto.UserMessage = {
      id: 'm7',
      conversationId: 'c1',
      parent: null,
      sentAt: new Date().toISOString(),
      citations: [],
      role: 'user',
      content: 'no files here',
      attachments: [],
    }
    const classic = projectMessageForEstimation(msg, false)
    const interspersed = projectMessageForEstimation(msg, true)
    expect(classic.items).toEqual(interspersed.items)
  })
})

// ---------------------------------------------------------------------------
// 4. dtoMessageToLlmMessage — interspersed mode content ordering
// ---------------------------------------------------------------------------
describe('dtoMessageToLlmMessage — interspersed mode', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  test('image: descriptor text precedes image part', async () => {
    vi.doMock('@/lib/env', () => ({
      default: { knowledge: { intersperseFileMetadata: true } },
    }))
    getFileWithId.mockResolvedValue(pngFile)
    readBuffer.mockResolvedValue(Buffer.from('png-bytes'))

    const { dtoMessageToLlmMessage } = await import('@/backend/lib/chat/conversion')
    const msg = await dtoMessageToLlmMessage(
      {
        id: 'u1',
        conversationId: 'c1',
        parent: null,
        sentAt: new Date().toISOString(),
        citations: [],
        role: 'user',
        content: 'look at this',
        attachments: [{ id: pngFile.id, name: pngFile.name, mimetype: pngFile.type, size: pngFile.size }],
      },
      visionCapabilities,
      'openai.chat'
    )

    expect(msg).toBeDefined()
    expect(Array.isArray(msg!.content)).toBe(true)
    const parts = msg!.content as Array<{ type: string; text?: string; image?: string }>
    // [content text, descriptor text, image part]
    expect(parts).toHaveLength(3)
    expect(parts[0]).toMatchObject({ type: 'text', text: 'look at this' })
    expect(parts[1]).toMatchObject({ type: 'text' })
    expect(parts[1]!.text).toContain('Attachment 1: screenshot.png (id img-1, image/png, 9321 bytes)')
    expect(parts[2]).toMatchObject({ type: 'image' })
    expect(parts[2]!.image).toContain('data:image/png;base64,')
  })

  test('two images: two descriptor+image pairs', async () => {
    vi.doMock('@/lib/env', () => ({
      default: { knowledge: { intersperseFileMetadata: true } },
    }))
    getFileWithId
      .mockResolvedValueOnce(pngFile)
      .mockResolvedValueOnce(jpgFile)
    readBuffer.mockResolvedValue(Buffer.from('img-bytes'))

    const { dtoMessageToLlmMessage } = await import('@/backend/lib/chat/conversion')
    const msg = await dtoMessageToLlmMessage(
      {
        id: 'u2',
        conversationId: 'c1',
        parent: null,
        sentAt: new Date().toISOString(),
        citations: [],
        role: 'user',
        content: '',
        attachments: [
          { id: pngFile.id, name: pngFile.name, mimetype: pngFile.type, size: pngFile.size },
          { id: jpgFile.id, name: jpgFile.name, mimetype: jpgFile.type, size: jpgFile.size },
        ],
      },
      visionCapabilities,
      'openai.chat'
    )

    const parts = msg!.content as Array<{ type: string; text?: string }>
    // [desc1, img1, desc2, img2]
    expect(parts).toHaveLength(4)
    expect(parts[0]).toMatchObject({ type: 'text' })
    expect(parts[0]!.text).toContain('Attachment 1:')
    expect(parts[1]).toMatchObject({ type: 'image' })
    expect(parts[2]).toMatchObject({ type: 'text' })
    expect(parts[2]!.text).toContain('Attachment 2:')
    expect(parts[3]).toMatchObject({ type: 'image' })
  })

  test('classic mode (intersperseFileMetadata=false): text first then images', async () => {
    vi.doMock('@/lib/env', () => ({
      default: { knowledge: { intersperseFileMetadata: false } },
    }))
    getFileWithId
      .mockResolvedValueOnce(pngFile)
      .mockResolvedValueOnce(jpgFile)
    readBuffer.mockResolvedValue(Buffer.from('img-bytes'))

    const { dtoMessageToLlmMessage } = await import('@/backend/lib/chat/conversion')
    const msg = await dtoMessageToLlmMessage(
      {
        id: 'u3',
        conversationId: 'c1',
        parent: null,
        sentAt: new Date().toISOString(),
        citations: [],
        role: 'user',
        content: 'hi',
        attachments: [
          { id: pngFile.id, name: pngFile.name, mimetype: pngFile.type, size: pngFile.size },
          { id: jpgFile.id, name: jpgFile.name, mimetype: jpgFile.type, size: jpgFile.size },
        ],
      },
      visionCapabilities,
      'openai.chat'
    )

    const parts = msg!.content as Array<{ type: string; text?: string }>
    // Classic: [content text, global descriptor, img1, img2]
    expect(parts).toHaveLength(4)
    expect(parts[0]).toMatchObject({ type: 'text', text: 'hi' })
    expect(parts[1]).toMatchObject({ type: 'text' })
    expect(parts[1]!.text).toContain('The user has attached')
    expect(parts[2]).toMatchObject({ type: 'image' })
    expect(parts[3]).toMatchObject({ type: 'image' })
  })

  test('interspersed: text fallback file gets descriptor before text content', async () => {
    vi.doMock('@/lib/env', () => ({
      default: { knowledge: { intersperseFileMetadata: true } },
    }))
    getFileWithId.mockResolvedValue(pdfFile)
    extractFromFile.mockResolvedValue('pdf text content')

    const { dtoMessageToLlmMessage } = await import('@/backend/lib/chat/conversion')
    const msg = await dtoMessageToLlmMessage(
      {
        id: 'u4',
        conversationId: 'c1',
        parent: null,
        sentAt: new Date().toISOString(),
        citations: [],
        role: 'user',
        content: '',
        attachments: [{ id: pdfFile.id, name: pdfFile.name, mimetype: pdfFile.type, size: pdfFile.size }],
      },
      noVisionCapabilities, // no PDF support → text fallback
      'openai.chat'
    )

    const parts = msg!.content as Array<{ type: string; text?: string }>
    // [descriptor text, text-fallback text]
    expect(parts).toHaveLength(2)
    expect(parts[0]).toMatchObject({ type: 'text' })
    expect(parts[0]!.text).toContain('Attachment 1: report.pdf (id pdf-1')
    expect(parts[1]).toMatchObject({ type: 'text' })
    expect(parts[1]!.text).toContain('pdf text content')
  })

  test('missing file entry is skipped with a warning (interspersed mode)', async () => {
    vi.doMock('@/lib/env', () => ({
      default: { knowledge: { intersperseFileMetadata: true } },
    }))
    // First file OK, second not found
    getFileWithId
      .mockResolvedValueOnce(pngFile)
      .mockResolvedValueOnce(null)
    readBuffer.mockResolvedValue(Buffer.from('img-bytes'))

    const { dtoMessageToLlmMessage } = await import('@/backend/lib/chat/conversion')
    const msg = await dtoMessageToLlmMessage(
      {
        id: 'u5',
        conversationId: 'c1',
        parent: null,
        sentAt: new Date().toISOString(),
        citations: [],
        role: 'user',
        content: '',
        attachments: [
          { id: pngFile.id, name: pngFile.name, mimetype: pngFile.type, size: pngFile.size },
          { id: 'missing-id', name: 'ghost.png', mimetype: 'image/png', size: 1 },
        ],
      },
      visionCapabilities,
      'openai.chat'
    )

    const parts = msg!.content as Array<{ type: string }>
    // Descriptor for first + image for first; descriptor for second emitted but file skipped
    // Items: [desc1, img1, desc2] — second descriptor is still emitted, file part is omitted
    expect(parts.some((p) => p.type === 'image')).toBe(true)
    expect(warn).toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// 5. preparePreamblePlan — knowledge segment in interspersed mode
// ---------------------------------------------------------------------------
describe('preparePreamblePlan — interspersed knowledge mode', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  const makeLlmModel = (capabilities: LlmModelCapabilities) => ({
    id: 'test-model',
    capabilities,
    providerId: 'test',
  })

  const knowledgeFiles: dto.AssistantFile[] = [
    { id: 'k1', name: 'handbook.pdf', type: 'application/pdf', size: 123456 },
    { id: 'k2', name: 'photo.png', type: 'image/png', size: 78900 },
  ]

  const assistantParams = { systemPrompt: 'You are helpful.' }

  test('interspersed: knowledgePrompt does not contain JSON file listing', async () => {
    vi.doMock('@/lib/env', () => ({
      default: {
        knowledge: { sendInPrompt: true, intersperseFileMetadata: true, alwaysConvertToText: true },
      },
    }))
    const mockLoadKnowledgeFilePart = vi.fn().mockResolvedValue({ type: 'text', text: 'extracted' })
    vi.doMock('@/backend/lib/tools/knowledge/implementation', () => ({
      loadKnowledgeFilePart: mockLoadKnowledgeFilePart,
      KnowledgePlugin: class {
        toolParams = { promptFragment: '' }
        supportedMedia = []
        functions = async () => ({})
      },
    }))

    const { preparePreamblePlan } = await import('@/backend/lib/chat/preamble')
    const plan = await preparePreamblePlan({
      assistantParams,
      llmModel: makeLlmModel(noVisionCapabilities) as any,
      tools: [],
      parameters: {},
      knowledge: knowledgeFiles,
    })

    expect(plan.intersperseFileMetadata).toBe(true)
    expect(plan.knowledgePrompt).toBeDefined()
    // No JSON dump of the file list
    expect(plan.knowledgePrompt).not.toContain('"handbook.pdf"')
    expect(plan.knowledgePrompt).not.toContain(JSON.stringify(knowledgeFiles))
    expect(plan.knowledgeFileEntries).toHaveLength(2)
    // size is present in each entry
    expect(plan.knowledgeFileEntries![0]!.size).toBe(123456)
    expect(plan.knowledgeFileEntries![1]!.size).toBe(78900)
  })

  test('interspersed: materializeKnowledgeSegment returns [descriptor, content] pairs', async () => {
    vi.doMock('@/lib/env', () => ({
      default: {
        knowledge: { sendInPrompt: true, intersperseFileMetadata: true, alwaysConvertToText: true },
      },
    }))
    const mockLoadKnowledgeFilePart = vi.fn()
      .mockResolvedValueOnce({ type: 'text', text: 'handbook text' })
      .mockResolvedValueOnce({ type: 'text', text: 'photo text' })
    vi.doMock('@/backend/lib/tools/knowledge/implementation', () => ({
      loadKnowledgeFilePart: mockLoadKnowledgeFilePart,
      KnowledgePlugin: class {
        toolParams = { promptFragment: '' }
        supportedMedia = []
        functions = async () => ({})
      },
    }))

    const { preparePreamblePlan } = await import('@/backend/lib/chat/preamble')
    const plan = await preparePreamblePlan({
      assistantParams,
      llmModel: makeLlmModel(noVisionCapabilities) as any,
      tools: [],
      parameters: {},
      knowledge: knowledgeFiles,
    })

    const rendered = await plan.materializeKnowledgeSegment!()
    expect(rendered).not.toBeNull()
    const parts = rendered!.message.content as Array<{ type: string; text?: string }>
    // [desc1, content1, desc2, content2]
    expect(parts).toHaveLength(4)
    expect(parts[0]).toMatchObject({ type: 'text' })
    expect(parts[0]!.text).toContain('Knowledge 1: handbook.pdf (id k1')
    expect(parts[1]).toMatchObject({ type: 'text', text: 'handbook text' })
    expect(parts[2]).toMatchObject({ type: 'text' })
    expect(parts[2]!.text).toContain('Knowledge 2: photo.png (id k2')
    expect(parts[3]).toMatchObject({ type: 'text', text: 'photo text' })
  })

  test('classic: knowledgePrompt contains JSON file listing', async () => {
    vi.doMock('@/lib/env', () => ({
      default: {
        knowledge: { sendInPrompt: true, intersperseFileMetadata: false, alwaysConvertToText: true },
      },
    }))
    const mockLoadKnowledgeFilePart = vi.fn().mockResolvedValue({ type: 'text', text: 'x' })
    vi.doMock('@/backend/lib/tools/knowledge/implementation', () => ({
      loadKnowledgeFilePart: mockLoadKnowledgeFilePart,
      KnowledgePlugin: class {
        toolParams = { promptFragment: '' }
        supportedMedia = []
        functions = async () => ({})
      },
    }))

    const { preparePreamblePlan } = await import('@/backend/lib/chat/preamble')
    const plan = await preparePreamblePlan({
      assistantParams,
      llmModel: makeLlmModel(noVisionCapabilities) as any,
      tools: [],
      parameters: {},
      knowledge: knowledgeFiles,
    })

    expect(plan.intersperseFileMetadata).toBeUndefined()
    expect(plan.knowledgePrompt).toContain('"handbook.pdf"')
  })

  test('classic: materializeKnowledgeSegment returns flat file parts (no descriptors)', async () => {
    vi.doMock('@/lib/env', () => ({
      default: {
        knowledge: { sendInPrompt: true, intersperseFileMetadata: false, alwaysConvertToText: true },
      },
    }))
    const mockLoadKnowledgeFilePart = vi.fn()
      .mockResolvedValueOnce({ type: 'text', text: 'handbook text' })
      .mockResolvedValueOnce({ type: 'text', text: 'photo text' })
    vi.doMock('@/backend/lib/tools/knowledge/implementation', () => ({
      loadKnowledgeFilePart: mockLoadKnowledgeFilePart,
      KnowledgePlugin: class {
        toolParams = { promptFragment: '' }
        supportedMedia = []
        functions = async () => ({})
      },
    }))

    const { preparePreamblePlan } = await import('@/backend/lib/chat/preamble')
    const plan = await preparePreamblePlan({
      assistantParams,
      llmModel: makeLlmModel(noVisionCapabilities) as any,
      tools: [],
      parameters: {},
      knowledge: knowledgeFiles,
    })

    const rendered = await plan.materializeKnowledgeSegment!()
    const parts = rendered!.message.content as Array<{ type: string; text?: string }>
    // Classic: just [content1, content2] — no descriptor text parts
    expect(parts).toHaveLength(2)
    expect(parts[0]).toMatchObject({ type: 'text', text: 'handbook text' })
    expect(parts[1]).toMatchObject({ type: 'text', text: 'photo text' })
  })

  test('no knowledge files → empty plan regardless of mode', async () => {
    vi.doMock('@/lib/env', () => ({
      default: {
        knowledge: { sendInPrompt: true, intersperseFileMetadata: true, alwaysConvertToText: true },
      },
    }))
    vi.doMock('@/backend/lib/tools/knowledge/implementation', () => ({
      loadKnowledgeFilePart: vi.fn(),
      KnowledgePlugin: class {
        toolParams = { promptFragment: '' }
        supportedMedia = []
        functions = async () => ({})
      },
    }))

    const { preparePreamblePlan } = await import('@/backend/lib/chat/preamble')
    const plan = await preparePreamblePlan({
      assistantParams,
      llmModel: makeLlmModel(noVisionCapabilities) as any,
      tools: [],
      parameters: {},
      knowledge: [],
    })

    expect(plan.knowledgeFileEntries).toBeUndefined()
    expect(plan.materializeKnowledgeSegment).toBeUndefined()
  })

  test('ordinals are 1-based and sequential for knowledge files', async () => {
    vi.doMock('@/lib/env', () => ({
      default: {
        knowledge: { sendInPrompt: true, intersperseFileMetadata: true, alwaysConvertToText: true },
      },
    }))
    const mockLoadKnowledgeFilePart = vi.fn().mockResolvedValue({ type: 'text', text: '' })
    vi.doMock('@/backend/lib/tools/knowledge/implementation', () => ({
      loadKnowledgeFilePart: mockLoadKnowledgeFilePart,
      KnowledgePlugin: class {
        toolParams = { promptFragment: '' }
        supportedMedia = []
        functions = async () => ({})
      },
    }))
    const three: dto.AssistantFile[] = [
      { id: 'a', name: 'one.pdf', type: 'application/pdf', size: 1 },
      { id: 'b', name: 'two.pdf', type: 'application/pdf', size: 2 },
      { id: 'c', name: 'three.pdf', type: 'application/pdf', size: 3 },
    ]

    const { preparePreamblePlan } = await import('@/backend/lib/chat/preamble')
    const plan = await preparePreamblePlan({
      assistantParams,
      llmModel: makeLlmModel(noVisionCapabilities) as any,
      tools: [],
      parameters: {},
      knowledge: three,
    })

    const rendered = await plan.materializeKnowledgeSegment!()
    const parts = rendered!.message.content as Array<{ type: string; text?: string }>
    const descriptors = parts.filter((p) => p.type === 'text' && p.text?.startsWith('Knowledge'))
    expect(descriptors[0]!.text).toContain('Knowledge 1:')
    expect(descriptors[1]!.text).toContain('Knowledge 2:')
    expect(descriptors[2]!.text).toContain('Knowledge 3:')
  })
})

// ---------------------------------------------------------------------------
// 6. Edge cases for projectMessageForEstimation — non-user messages unchanged
// ---------------------------------------------------------------------------
describe('projectMessageForEstimation — non-user messages', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  test('assistant messages are unaffected by intersperseFileMetadata flag', async () => {
    const { projectMessageForEstimation } = await import('@/backend/lib/chat/message-projection')
    const msg: dto.AssistantMessage = {
      id: 'a1',
      conversationId: 'c1',
      parent: null,
      sentAt: new Date().toISOString(),
      citations: [],
      role: 'assistant',
      parts: [{ type: 'text', text: 'hi' }],
    }
    const classic = projectMessageForEstimation(msg, false)
    const interspersed = projectMessageForEstimation(msg, true)
    expect(classic.items).toEqual(interspersed.items)
  })

  test('user-request role is ignored in both modes', async () => {
    const { projectMessageForEstimation } = await import('@/backend/lib/chat/message-projection')
    const msg = {
      id: 'ur1',
      conversationId: 'c1',
      parent: null,
      sentAt: new Date().toISOString(),
      citations: [],
      role: 'user-request' as const,
      content: 'hi',
      attachments: [],
    } as unknown as dto.Message
    expect(projectMessageForEstimation(msg, false).role).toBe('ignored')
    expect(projectMessageForEstimation(msg, true).role).toBe('ignored')
  })
})
