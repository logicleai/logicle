import * as dto from '@/types/dto'
import type { FileDbRow } from '@/backend/models/file'
import env from '@/lib/env'
import { logger } from '@/lib/logging'
import { projectMessageForEstimationCached } from './message-projection'

// Model/DB-backed helpers are imported dynamically (below, at point of use) rather than statically
// at module scope. This file is on the hot import path of `apps/backend/lib/chat/index.ts`, and a
// static import of a DB-touching model here would force DB dialect initialization as soon as the
// chat module is merely imported, even in tests/contexts that never invoke context compression.

/**
 * Bump when the summary-building rules below change so stale `CompressedMessage` rows are
 * regenerated instead of reused.
 */
export const COMPRESSION_VERSION = 2

/**
 * The assistant-configured `triggerAtTokens` can only raise the floor below which compression
 * never runs, never lower it — this guarantees short conversations are always sent in full.
 */
export function resolveCompressionTriggerTokens(triggerAtTokens: number | undefined): number {
  return Math.max(triggerAtTokens ?? 0, env.chat.contextCompressionTriggerTokens)
}

type ToolMessagePart = dto.ToolMessage['parts'][number]

const LARGE_TEXT_THRESHOLD_CHARS = 2000
const AGGRESSIVE_LARGE_TEXT_THRESHOLD_CHARS = 800
const LARGE_ARGS_VALUE_THRESHOLD_CHARS = 200
const INLINE_SUMMARY_MAX_CHARS = 500
const REDACTED_ARGS_MARKER =
  '[redacted: content available via context-retrieve, see summarized result]'
const INLINE_SUMMARY_CONCURRENCY = 2

const isImageMimeType = (mimetype: string) => mimetype.startsWith('image/')
const charsToTokens = (chars: number) => Math.ceil(chars / 4)

async function mapWithConcurrency<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let nextIndex = 0
  async function worker() {
    while (nextIndex < items.length) {
      const i = nextIndex++
      results[i] = await fn(items[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker))
  return results
}

const estimateMessageChars = (message: dto.Message): number => {
  const projected = projectMessageForEstimationCached(message)
  let chars = 0
  for (const item of projected.items) {
    if (item.kind === 'text') chars += item.text.length
    else if (item.kind === 'attachment') chars += 200
    else if (item.kind === 'tool_result') {
      const output = item.output
      if (output.type === 'text' || output.type === 'error-text') chars += output.value.length
      else if (output.type === 'content') {
        for (const v of output.value) chars += v.type === 'text' ? v.text.length : 200
      } else chars += JSON.stringify(output.value).length
    }
  }
  return chars
}

export function buildFileRecoveryReference(
  fileRef: dto.CompressionFileRef,
  summary: string
): string {
  return [
    `File available on demand: ${fileRef.name}`,
    `id: ${fileRef.id}`,
    `type: ${fileRef.mimetype}`,
    `summary: ${summary}`,
    'Use context-retrieve.get_file with this id if exact contents are needed.',
  ].join('\n')
}

/**
 * Every summarized message — file-backed or not — must expose its own id, so the model can always
 * fall back to `context-retrieve.get_message` even when a summary carries no file reference (e.g.
 * a long historical text block truncated under the aggressive preset). See "Every Summary Exposes
 * Its Own Message Id" in docs/context-compression.md.
 */
export function buildMessageRecoveryNote(messageId: string): string {
  return `Full original message available on demand via context-retrieve.get_message with id: ${messageId}.`
}

/**
 * Builds a plain-text, inline preview of a file's content — deterministic text extraction plus a
 * hard truncation, never a model call. See "Summaries Are Always Plain Text" in
 * docs/context-compression.md.
 */
async function buildInlineTextSummary(fileEntry: FileDbRow | undefined): Promise<string> {
  if (!fileEntry) return 'No preview available (file metadata could not be loaded).'
  if (isImageMimeType(fileEntry.type)) {
    return 'Image file; no text preview available.'
  }
  const { cachingExtractor } = await import('@/lib/textextraction/cache')
  const text = await cachingExtractor.extractFromFile(fileEntry)
  if (!text) return 'No extractable text preview available for this file type.'
  const normalized = text.trim().replace(/\s+/g, ' ')
  return normalized.length > INLINE_SUMMARY_MAX_CHARS
    ? `${normalized.slice(0, INLINE_SUMMARY_MAX_CHARS)}…`
    : normalized
}

const truncateInline = (text: string): string =>
  text.length > INLINE_SUMMARY_MAX_CHARS
    ? `${text.slice(0, INLINE_SUMMARY_MAX_CHARS)}…[truncated; ${text.length} chars omitted]`
    : text

/**
 * `warmCompressionCache` (fired right after save) and `applyCompressionPlan` (run during a
 * concurrent request's prompt build) can both decide to build the same message's compressed form
 * at the same time. `getCompressedMessage`/`saveCompressedMessage` alone would just mean duplicate
 * extraction work landing on the same cache row (harmless — `saveCompressedMessage` upserts), but
 * it's wasted I/O. This in-process map lets a second caller join the first caller's in-flight
 * build instead of starting a redundant one. It only dedupes within a single server process; a
 * genuinely concurrent build in another process still lands safely, just without the join.
 */
const inFlightCompressions = new Map<string, Promise<unknown>>()

function compressOnce<T>(messageId: string, build: () => Promise<T>): Promise<T> {
  const existing = inFlightCompressions.get(messageId) as Promise<T> | undefined
  if (existing) return existing
  const promise = build().finally(() => inFlightCompressions.delete(messageId))
  inFlightCompressions.set(messageId, promise)
  return promise
}

function findCurrentTurnUserMessageId(messages: dto.Message[]): string | undefined {
  for (let i = messages.length - 1; i >= 0; i--) {
    const role = messages[i]!.role
    if (role === 'user' || role === 'user-response') return messages[i]!.id
  }
  return undefined
}

/**
 * Deterministic planner: decides, per message, whether the prompt builder should use the
 * message's `full` persisted content or a `summary` representation.
 *
 * Invariant: every message belonging to the current turn (the last user/user-response message and
 * everything after it) is always `full`, for every preset — see "Current Turn Is Never Compressed"
 * in docs/context-compression.md.
 *
 * Does not read or write any DB rows itself — `applyCompressionPlan` handles that when actually
 * building the summary text.
 *
 * Deliberately does not look at what the *current* message says (e.g. "what's in report.pdf?"):
 * that would make a historical message's policy flip between `full` and `summary` from one turn
 * to the next, which changes the serialized prefix of the prompt on every turn and defeats
 * provider-side prompt caching. A historical message's policy is decided once, by its own
 * position and shape, and stays that way for the rest of the conversation — see "Decisions Are
 * Turn-Stable" in docs/context-compression.md.
 */
export function planMessageCompression(
  messages: dto.Message[],
  preset: dto.ContextCompressionPreset
): dto.MessageCompressionDecision[] {
  const currentTurnUserMessageId = findCurrentTurnUserMessageId(messages)
  const largeTextThreshold =
    preset === 'aggressive' ? AGGRESSIVE_LARGE_TEXT_THRESHOLD_CHARS : LARGE_TEXT_THRESHOLD_CHARS

  const decisions: dto.MessageCompressionDecision[] = []
  let activeTurnUserMessageId: string | undefined

  for (const message of messages) {
    if (message.role === 'user' || message.role === 'user-response') {
      activeTurnUserMessageId = message.id
    }
    const isCurrentTurn = activeTurnUserMessageId === currentTurnUserMessageId

    const chars = estimateMessageChars(message)
    const tokensBefore = charsToTokens(chars)
    let policy: 'full' | 'summary' = 'full'
    let reason = 'no compressible content'

    if (isCurrentTurn) {
      reason = 'current turn is never compressed'
    } else if (message.role === 'user') {
      const hasAttachments = message.attachments.length > 0
      const hasLargeText = preset === 'aggressive' && message.content.length > largeTextThreshold
      if (hasAttachments || hasLargeText) {
        policy = 'summary'
        reason = hasAttachments
          ? 'historical user attachment'
          : 'large historical user message (aggressive preset)'
      }
    } else if (message.role === 'tool') {
      let hasFileItems = false
      for (const part of message.parts) {
        if (part.type !== 'tool-result' || part.result.type !== 'content') continue
        if (part.result.value.some((item) => item.type === 'file')) hasFileItems = true
      }
      const isLargeText = chars > largeTextThreshold
      if (hasFileItems || isLargeText) {
        policy = 'summary'
        reason = hasFileItems
          ? 'historical tool result with recoverable file'
          : 'large historical tool output'
      }
    }

    const tokensAfter = policy === 'summary' ? Math.min(tokensBefore, 40) : tokensBefore
    decisions.push({
      messageId: message.id,
      policy,
      reason,
      estimatedTokensBefore: tokensBefore,
      estimatedTokensAfter: tokensAfter,
    })
  }

  return decisions
}

/**
 * Rewrites `messages` according to `decisions`: `full` messages pass through unchanged, `summary`
 * messages are replaced with a compact, cached representation (see `CompressedMessage`). Also
 * redacts duplicated generated-artifact content from assistant `tool-call.args` when the
 * corresponding tool-result was summarized, per docs/context-compression.md's "Generated
 * Artifacts" section.
 */
export async function applyCompressionPlan(
  messages: dto.Message[],
  decisions: dto.MessageCompressionDecision[]
): Promise<dto.Message[]> {
  const decisionByMessageId = new Map(decisions.map((d) => [d.messageId, d]))
  const output: dto.Message[] = []
  const assistantToolCallIndices = new Map<string, number[]>()

  for (const message of messages) {
    const decision = decisionByMessageId.get(message.id)
    if (!decision || decision.policy === 'full') {
      const outputIndex = output.push(message) - 1
      recordAssistantToolCallIndices(message, outputIndex, assistantToolCallIndices)
      continue
    }

    if (message.role === 'user') {
      output.push(await compressOnce(message.id, () => compressUserMessage(message)))
      continue
    }

    if (message.role === 'tool') {
      const { compacted, compactedToolCallIds } = await compressOnce(message.id, () =>
        compressToolMessage(message)
      )
      if (compactedToolCallIds.size > 0) {
        redactSiblingToolCallArgs(output, assistantToolCallIndices, compactedToolCallIds)
      }
      output.push(compacted)
      continue
    }

    const outputIndex = output.push(message) - 1
    recordAssistantToolCallIndices(message, outputIndex, assistantToolCallIndices)
  }

  return output
}

/**
 * Kicks off compaction for a single freshly-persisted message, ahead of any prompt build, so the
 * `CompressedMessage` cache is already warm by the time the message could become historical. Must
 * never throw — callers use this fire-and-forget right after a DB write. See "Compression Starts
 * on Save" in docs/context-compression.md.
 */
export async function warmCompressionCache(message: dto.Message): Promise<void> {
  try {
    if (message.role === 'user') {
      const eligible =
        message.attachments.length > 0 || message.content.length > LARGE_TEXT_THRESHOLD_CHARS
      if (eligible) await compressOnce(message.id, () => compressUserMessage(message))
      return
    }
    if (message.role === 'tool') {
      const eligible = message.parts.some((part) => {
        if (part.type !== 'tool-result') return false
        const { result } = part
        if (result.type === 'content') return result.value.some((v) => v.type === 'file')
        if (result.type === 'text' || result.type === 'error-text')
          return result.value.length > LARGE_TEXT_THRESHOLD_CHARS
        return false
      })
      if (eligible) await compressOnce(message.id, () => compressToolMessage(message))
    }
  } catch (err) {
    logger.warn('Context compression cache warm-up failed', { messageId: message.id, err })
  }
}

async function compressUserMessage(message: dto.UserMessage): Promise<dto.UserMessage> {
  const { getCompressedMessage, saveCompressedMessage } = await import(
    '@/models/compressed-message'
  )
  const cached = await getCompressedMessage(message.id, COMPRESSION_VERSION)
  if (cached) {
    return { ...message, ...(cached.content as Partial<dto.UserMessage>) }
  }

  // No length guard here: callers only reach this function once they've already decided this
  // message should be compressed (via planMessageCompression's policy, or warmCompressionCache's
  // own eligibility check) — re-checking a fixed threshold here would silently disagree with a
  // preset-aware decision made upstream (e.g. the aggressive preset's lower text threshold).
  const hasAttachments = message.attachments.length > 0

  const referenceLines: string[] = []
  if (hasAttachments) {
    const { getFileWithId } = await import('@/models/file')
    const attachmentSummaries = await mapWithConcurrency(
      message.attachments,
      async (attachment) => {
        const fileEntry = await getFileWithId(attachment.id)
        const fileRef: dto.CompressionFileRef = {
          id: attachment.id,
          name: attachment.name,
          mimetype: attachment.mimetype,
          size: attachment.size,
          origin: fileEntry?.origin ?? 'uploaded',
          sourceMessageId: message.id,
        }
        return buildFileRecoveryReference(fileRef, await buildInlineTextSummary(fileEntry))
      },
      INLINE_SUMMARY_CONCURRENCY
    )
    referenceLines.push(...attachmentSummaries)
  }

  const bodyText = hasAttachments ? message.content : truncateInline(message.content)
  const content: Partial<dto.UserMessage> = {
    content: [...referenceLines, bodyText, buildMessageRecoveryNote(message.id)]
      .filter(Boolean)
      .join('\n\n'),
    attachments: [],
  }

  await saveCompressedMessage({
    sourceMessageId: message.id,
    compressionVersion: COMPRESSION_VERSION,
    content,
    version: message.version ?? null,
  })

  return { ...message, ...content }
}

async function compressToolMessage(
  message: dto.ToolMessage
): Promise<{ compacted: dto.ToolMessage; compactedToolCallIds: Set<string> }> {
  const compactedToolCallIds = new Set<string>()
  const { getCompressedMessage, saveCompressedMessage } = await import(
    '@/models/compressed-message'
  )

  const cached = await getCompressedMessage(message.id, COMPRESSION_VERSION)
  if (cached) {
    const parts = (cached.content as { parts: ToolMessagePart[] }).parts
    for (const part of parts) {
      if (part.type === 'tool-result') compactedToolCallIds.add(part.toolCallId)
    }
    return { compacted: { ...message, parts }, compactedToolCallIds }
  }

  const parts: ToolMessagePart[] = []
  for (const part of message.parts) {
    if (part.type !== 'tool-result') {
      parts.push(part)
      continue
    }
    compactedToolCallIds.add(part.toolCallId)
    parts.push(await compressToolResultPart(part, message.id))
  }

  await saveCompressedMessage({
    sourceMessageId: message.id,
    compressionVersion: COMPRESSION_VERSION,
    content: { parts },
    version: message.version ?? null,
  })

  return { compacted: { ...message, parts }, compactedToolCallIds }
}

const TOOL_RESULT_OVERVIEW = '[Tool output summarized for context efficiency.]'

async function compressToolResultPart(
  part: dto.ToolCallResultPart,
  sourceMessageId: string
): Promise<dto.ToolCallResultPart> {
  const { result } = part

  if (result.type === 'content') {
    // Original narrative text (and any inline duplicate of generated-file content) is dropped in
    // favor of a fixed overview line plus a stable file-recovery reference per recoverable file —
    // otherwise the un-summarized text could still leak the full content back into the prompt.
    const { getFileWithId } = await import('@/models/file')
    const fileItems = result.value.filter((item) => item.type === 'file') as Array<
      (typeof result.value)[number] & { type: 'file' }
    >
    const fileReferences = await mapWithConcurrency(
      fileItems,
      async (item) => {
        const fileEntry = await getFileWithId(item.id)
        const fileRef: dto.CompressionFileRef = {
          id: item.id,
          name: item.name,
          mimetype: item.mimetype,
          size: item.size,
          origin: fileEntry?.origin ?? 'generated',
          sourceMessageId,
        }
        return buildFileRecoveryReference(fileRef, await buildInlineTextSummary(fileEntry))
      },
      INLINE_SUMMARY_CONCURRENCY
    )
    return {
      ...part,
      result: {
        type: 'text',
        value: [
          TOOL_RESULT_OVERVIEW,
          ...fileReferences,
          buildMessageRecoveryNote(sourceMessageId),
        ].join('\n\n'),
      },
    }
  }

  if (result.type === 'text' || result.type === 'error-text') {
    return {
      ...part,
      result: {
        type: 'text',
        value: `${TOOL_RESULT_OVERVIEW}\n\n${truncateInline(
          result.value
        )}\n\n${buildMessageRecoveryNote(sourceMessageId)}`,
      },
    }
  }

  return {
    ...part,
    result: {
      type: 'text',
      value: `${TOOL_RESULT_OVERVIEW}\n\n${buildMessageRecoveryNote(sourceMessageId)}`,
    },
  }
}

function recordAssistantToolCallIndices(
  message: dto.Message,
  outputIndex: number,
  assistantToolCallIndices: Map<string, number[]>
): void {
  if (message.role !== 'assistant') return
  for (const part of message.parts) {
    if (part.type !== 'tool-call') continue
    const indices = assistantToolCallIndices.get(part.toolCallId)
    if (indices) {
      indices.push(outputIndex)
    } else {
      assistantToolCallIndices.set(part.toolCallId, [outputIndex])
    }
  }
}

function redactSiblingToolCallArgs(
  output: dto.Message[],
  assistantToolCallIndices: Map<string, number[]>,
  toolCallIds: Set<string>
): void {
  for (const toolCallId of toolCallIds) {
    const indices = assistantToolCallIndices.get(toolCallId)
    if (!indices) continue
    for (const i of indices) {
      const candidate = output[i]
      if (!candidate || candidate.role !== 'assistant') continue
      let mutated = false
      const parts = candidate.parts.map((part) => {
        if (part.type !== 'tool-call' || part.toolCallId !== toolCallId) return part
        const redactedArgs = redactLargeStringFields(part.args)
        if (redactedArgs === part.args) return part
        mutated = true
        return { ...part, args: redactedArgs }
      })
      if (mutated) {
        output[i] = { ...candidate, parts }
      }
    }
  }
}

function redactLargeStringFields(args: Record<string, any>): Record<string, any> {
  let mutated = false
  const result: Record<string, any> = {}
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string' && value.length > LARGE_ARGS_VALUE_THRESHOLD_CHARS) {
      result[key] = REDACTED_ARGS_MARKER
      mutated = true
    } else {
      result[key] = value
    }
  }
  return mutated ? result : args
}
