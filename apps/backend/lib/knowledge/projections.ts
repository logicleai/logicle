import * as ai from 'ai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
import sharp from 'sharp'
import { llmModels } from '@/lib/models'
import { getBackends } from '@/models/backend'
import { createLanguageModel } from '@/backend/lib/chat/provider-factory'
import { findReasonableSummarizationBackend } from '@/backend/lib/chat/summarizer'
import { logger } from '@/lib/logging'
import type { KnowledgeBoxQuestion } from '@/lib/tools/schemas'

/**
 * Projections are the cheap half of a knowledge box: at ingestion time we ask the admin's own
 * questions to each document once, and store the free-form answers. At chat time the model reads
 * those answers instead of the documents, and only then decides which document is worth searching.
 * One expensive pass at ingestion buys arbitrarily many cheap lookups afterwards.
 */

/** Characters of document text handed to the model in a single pass. */
const WINDOW_CHARS = 60_000
/** Windows above this count are truncated: a 100-window document is a configuration mistake. */
const MAX_WINDOWS = 12
/** Sentinel the model is told to emit when the document says nothing about the question. */
export const NO_ANSWER = 'N/A'

const providerScore = (providerType: string) => {
  if (providerType === 'logiclecloud') return 3
  if (providerType === 'openai') return 2
  if (providerType === 'anthropic') return 1
  if (providerType === 'gcp-vertex') return 0
  return -1
}

/**
 * Picks a model for ingestion. Prefers the same "cheap model for internal work" choice the chat
 * summarizer makes; when that is disabled (it defers to the chat's own model, which does not
 * exist during ingestion) it falls back to the best-scoring configured backend.
 */
export const resolveIngestionModel = async (): Promise<LanguageModelV3 | undefined> => {
  const summarizationModel = await findReasonableSummarizationBackend()
  if (summarizationModel) return summarizationModel

  const backends = await getBackends()
  const usable = backends
    .filter((backend) => llmModels.some((model) => model.provider === backend.providerType))
    .sort((left, right) => providerScore(right.providerType) - providerScore(left.providerType))
  const backend = usable[0]
  if (!backend) return undefined

  const models = llmModels.filter((model) => model.provider === backend.providerType)
  const preferred = models.find((model) => /mini|flash|haiku/i.test(model.id)) ?? models[0]
  return preferred ? createLanguageModel(backend, preferred) : undefined
}

/**
 * Picks a model that can inspect an image. This is separate from the text projection model:
 * summarisation backends are allowed to be text-only, while a visual index must never silently
 * send an image to one of them and pretend that it was inspected.
 */
export const resolveVisionIngestionModel = async (): Promise<LanguageModelV3 | undefined> => {
  const backends = await getBackends()
  const candidates = backends.flatMap((backend) =>
    llmModels
      .filter((model) => model.provider === backend.providerType && model.capabilities.vision)
      .map((model) => ({ backend, model }))
  )
  candidates.sort((left, right) => {
    const backendDifference =
      providerScore(right.backend.providerType) - providerScore(left.backend.providerType)
    if (backendDifference !== 0) return backendDifference
    const modelScore = (modelId: string) => {
      if (/mini|flash|haiku/i.test(modelId)) return 2
      if (/4o|sonnet|gemini/i.test(modelId)) return 1
      return 0
    }
    return modelScore(right.model.id) - modelScore(left.model.id)
  })

  const selected = candidates[0]
  return selected ? createLanguageModel(selected.backend, selected.model) : undefined
}

const splitIntoWindows = (text: string): string[] => {
  if (text.length <= WINDOW_CHARS) return [text]
  const windows: string[] = []
  for (
    let offset = 0;
    offset < text.length && windows.length < MAX_WINDOWS;
    offset += WINDOW_CHARS
  ) {
    windows.push(text.slice(offset, offset + WINDOW_CHARS))
  }
  return windows
}

/** Tokens spent answering a box's questions. Reported so the cost of building the index is
 * visible rather than hidden behind the savings it produces at query time. */
export interface ProjectionUsage {
  inputTokens: number
  outputTokens: number
  calls: number
  /** Model that generated the projections, for accurate ingestion-cost reporting. */
  modelId?: string
  /** Individual provider requests, retained so pricing tiers are applied per request. */
  providerUsages: ProjectionRequestUsage[]
}

export interface ProjectionRequestUsage {
  inputTokens: number
  outputTokens: number
  inputTokenDetails?: {
    noCacheTokens?: number
    cacheReadTokens?: number
    cacheWriteTokens?: number
  }
}

export const emptyProjectionUsage = (): ProjectionUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  calls: 0,
  providerUsages: [],
})

const addUsage = (into: ProjectionUsage, usage: ai.LanguageModelUsage): void => {
  // The provider type currently exposes totals as numbers, while providers (and the AI SDK
  // test model) may return the richer token-detail object at runtime.
  const rawUsage = usage as unknown as {
    inputTokens:
      | number
      | { total?: number; noCache?: number; cacheRead?: number; cacheWrite?: number }
    outputTokens: number | { total?: number }
    inputTokenDetails?: {
      noCacheTokens?: number
      cacheReadTokens?: number
      cacheWriteTokens?: number
    }
  }
  const input = rawUsage.inputTokens as
    | number
    | { total?: number; noCache?: number; cacheRead?: number; cacheWrite?: number }
  const inputTokens = typeof input === 'number' ? input : input?.total ?? 0
  const output = rawUsage.outputTokens
  const outputTokens = typeof output === 'number' ? output : output?.total ?? 0
  const inputTokenDetails =
    rawUsage.inputTokenDetails ??
    (typeof input === 'number'
      ? undefined
      : {
          noCacheTokens: input?.noCache,
          cacheReadTokens: input?.cacheRead,
          cacheWriteTokens: input?.cacheWrite,
        })
  const hasInputTokenDetails =
    inputTokenDetails && Object.values(inputTokenDetails).some((tokens) => tokens !== undefined)
  into.inputTokens += inputTokens
  into.outputTokens += outputTokens
  into.calls += 1
  into.providerUsages.push({
    inputTokens,
    outputTokens,
    ...(hasInputTokenDetails ? { inputTokenDetails } : {}),
  })
}

const generate = async (
  model: LanguageModelV3,
  system: string,
  user: string,
  usage: ProjectionUsage
): Promise<string> => {
  // The instructions go through `system`, never as a system-role message: `user` carries
  // document text, and keeping the two apart is what stops a document from issuing orders.
  const result = await ai.generateText({
    model,
    temperature: 0,
    system,
    prompt: user,
  })
  addUsage(usage, result.usage)
  return result.text.trim()
}

const generateImageDescription = async (
  model: LanguageModelV3,
  fileName: string,
  mimeType: string,
  data: Buffer,
  usage: ProjectionUsage
): Promise<string> => {
  // OCR still sees the original bytes. The VLM only needs a bounded visual copy: this keeps a
  // multi-megapixel catalogue scan from turning every ingestion into an unnecessarily expensive
  // image-token request, while preserving the original for get_file verification.
  const visualData = await sharp(data)
    .resize({ width: 1600, height: 1600, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 85 })
    .toBuffer()
  const result = await ai.generateText({
    model,
    temperature: 0,
    system: [
      'You are building a search index for an image in a private knowledge base.',
      `The image file is named "${fileName}" (${mimeType}); it is provided as a resized visual copy.`,
      'Describe only visible, search-useful content: readable text, product or document names, objects, distinctive shapes, colours, materials, labels, diagrams, and other visual landmarks.',
      'Do not guess an exact model, serial number, fabric, finish, measurement, price, or identity from appearance alone.',
      'This description is a navigation hint, not authoritative source text. Keep it under 160 words, dense and factual, with uncertainty when appropriate.',
    ].join('\n'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Create the visual search description now.' },
          {
            type: 'image',
            image: `data:image/jpeg;base64,${visualData.toString('base64')}`,
          },
        ],
      },
    ],
  })
  addUsage(usage, result.usage)
  return result.text.trim()
}

/**
 * Creates the searchable, non-authoritative visual index for an image-only document.
 * The caller is responsible for storing the original image and must use it for exact answers.
 */
export const describeImageForIndex = async (
  fileName: string,
  mimeType: string,
  data: Buffer,
  usage: ProjectionUsage = emptyProjectionUsage()
): Promise<string | null> => {
  const model = await resolveVisionIngestionModel()
  if (!model) {
    logger.warn('[knowledge-box] no vision LLM backend available, skipping visual index', {
      fileName,
    })
    return null
  }
  usage.modelId = model.modelId
  const description = await generateImageDescription(model, fileName, mimeType, data, usage)
  return description || null
}

const answerSystemPrompt = (fileName: string) =>
  [
    'You are indexing a document so that it can later be found without being read in full.',
    `The document is named "${fileName}".`,
    'Answer the question using only what the document says.',
    'Be dense and factual: no preamble, no restating the question, no markdown headings.',
    'Prefer concrete names, numbers, dates and identifiers over generic descriptions — the answer is used to decide whether this document is worth searching.',
    'Keep the answer under 120 words.',
    `If the document does not address the question at all, reply with exactly: ${NO_ANSWER}`,
  ].join('\n')

const reduceSystemPrompt = (fileName: string) =>
  [
    `Several parts of the document "${fileName}" were analyzed separately.`,
    'Merge the partial answers below into one coherent answer to the question.',
    'Drop duplicates and anything marked as unanswered. Do not invent information.',
    'Keep the answer under 120 words.',
    `If none of the parts answers the question, reply with exactly: ${NO_ANSWER}`,
  ].join('\n')

/**
 * Answers one question about one document, mapping over windows and reducing when the document
 * does not fit in a single pass. Returns null when the document has nothing to say.
 */
export const answerQuestion = async (
  model: LanguageModelV3,
  fileName: string,
  text: string,
  question: KnowledgeBoxQuestion,
  usage: ProjectionUsage = emptyProjectionUsage()
): Promise<string | null> => {
  const windows = splitIntoWindows(text)

  const partials: string[] = []
  for (const [index, window] of windows.entries()) {
    const label =
      windows.length === 1 ? '' : `\n\n(Part ${index + 1} of ${windows.length} of the document.)`
    const answer = await generate(
      model,
      answerSystemPrompt(fileName),
      `Question: ${question.prompt}${label}\n\n---\n${window}`,
      usage
    )
    if (answer && answer !== NO_ANSWER) partials.push(answer)
  }

  if (partials.length === 0) return null
  if (partials.length === 1) return partials[0]!

  const merged = await generate(
    model,
    reduceSystemPrompt(fileName),
    `Question: ${question.prompt}\n\nPartial answers:\n${partials
      .map((partial, index) => `[${index + 1}] ${partial}`)
      .join('\n\n')}`,
    usage
  )
  return merged && merged !== NO_ANSWER ? merged : null
}

export interface ComputedProjections {
  projections: { questionId: string; answer: string }[]
  usage: ProjectionUsage
}

export const computeProjections = async (
  fileName: string,
  text: string,
  questions: KnowledgeBoxQuestion[]
): Promise<ComputedProjections> => {
  const usage = emptyProjectionUsage()
  if (questions.length === 0) return { projections: [], usage }

  const model = await resolveIngestionModel()
  if (!model) {
    logger.warn('[knowledge-box] no LLM backend available, skipping projections', { fileName })
    return { projections: [], usage }
  }
  usage.modelId = model.modelId

  const projections: { questionId: string; answer: string }[] = []
  for (const question of questions) {
    const answer = await answerQuestion(model, fileName, text, question, usage)
    if (answer) projections.push({ questionId: question.id, answer })
  }
  return { projections, usage }
}
