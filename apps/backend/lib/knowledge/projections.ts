import * as ai from 'ai'
import type { LanguageModelV3 } from '@ai-sdk/provider'
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
}

export const emptyProjectionUsage = (): ProjectionUsage => ({
  inputTokens: 0,
  outputTokens: 0,
  calls: 0,
})

const addUsage = (into: ProjectionUsage, usage: ai.LanguageModelUsage): void => {
  into.inputTokens += usage.inputTokens ?? 0
  into.outputTokens += usage.outputTokens ?? 0
  into.calls += 1
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

  const projections: { questionId: string; answer: string }[] = []
  for (const question of questions) {
    const answer = await answerQuestion(model, fileName, text, question, usage)
    if (answer) projections.push({ questionId: question.id, answer })
  }
  return { projections, usage }
}
