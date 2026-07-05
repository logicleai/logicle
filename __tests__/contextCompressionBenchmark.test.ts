/**
 * Context-compression benchmark — runs real conversations through the live ChatAssistant stack
 * (real LLM calls, real context compression, real context-retrieve tool) and verifies that a fact
 * from an *early* turn can still be recovered correctly after that turn has been compressed away.
 *
 * Skipped in CI unless RUN_LLM_INTEGRATION=1 is set. Each provider is additionally skipped when
 * its API-key env var is absent. See __tests__/llm-integration.test.ts for the general pattern
 * this file follows (provider matrix, TestSink, skip gating).
 *
 * Two scenarios, both structured the same way:
 *   1. A real turn plants a fact that only exists in content compression will later strip
 *      (a tool-result / attachment, never repeated verbatim in the assistant's own reply).
 *   2. Enough synthetic filler history is spliced in (no LLM calls — deterministic, free) to push
 *      the conversation over the compression token floor.
 *   3. A precondition check calls `planMessageCompression` directly to confirm the planted turn
 *      really is decided `summary` before we even ask the model anything — this isolates "did
 *      compression run" from "could the model cope with it".
 *   4. A real follow-up turn asks for the fact back, instructed to answer with *only* the fact so
 *      the check is a plain substring match rather than a fuzzier "structured output" parse (this
 *      harness doesn't wire up real JSON-schema-constrained decoding — see note below).
 *   5. Assertions: the answer contains the fact, and the model actually called `context-retrieve`
 *      to get it (not just a lucky guess/hallucination).
 *
 * Required env vars (per provider), same as llm-integration.test.ts:
 *   OpenAI:    OPENAI_API_KEY     [OPENAI_MODEL]
 *   Anthropic: ANTHROPIC_API_KEY  [ANTHROPIC_MODEL]
 *   Gemini:    GEMINI_API_KEY     [GEMINI_MODEL]
 *   Vertex:    VERTEX_CREDENTIALS (JSON)  [VERTEX_MODEL]
 */

import { beforeEach, describe, expect, test, vi } from 'vitest'

// Infrastructure mocks — must be declared before any app imports.
const { fakeFiles, fakeFileTexts, compressedMessageStore } = vi.hoisted(() => ({
  fakeFiles: new Map<
    string,
    {
      id: string
      name: string
      type: string
      path: string
      encryption: null
      size: number
      origin: 'uploaded' | 'generated'
      fileBlobId: string | null
    }
  >(),
  fakeFileTexts: new Map<string, string>(),
  compressedMessageStore: new Map<string, unknown>(),
}))

vi.mock('@/lib/env', () => ({
  default: {
    dumpLlmConversation: false,
    allowMockProvider: false,
    chat: {
      autoSummary: { enable: false, useChatBackend: false },
      maxOutputTokens: undefined,
      disableParallelToolCalls: false,
    },
    knowledge: { sendInPrompt: true }, // skips KnowledgePlugin registration — out of scope here
    fileStorage: { encryptFiles: false },
    tools: { websearch: { defaultApiUrl: '' }, prefixFunctionNames: true },
    promptCaching: { anthropic: { preamble: 'none', automatic: 'none' }, openai: 'none' },
  },
}))
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn() },
  loggingFetch: undefined,
}))
vi.mock('@/lib/satellite/hub', () => ({ connections: [], callSatelliteMethod: vi.fn() }))
vi.mock('@/lib/storage', () => ({ storage: { writeBuffer: vi.fn(), readBuffer: vi.fn() } }))
vi.mock('@/models/user', () => ({}))
vi.mock('@/models/backend', () => ({ getBackends: vi.fn().mockResolvedValue([]) }))

// Fake file layer: enough for context-retrieve's get_file + compression's file-recovery
// references, without a real DB. Both this and context-retrieve's own internal lookup read from
// the same `fakeFiles` map, so results stay consistent.
vi.mock('@/models/file', () => ({
  getFileWithId: vi.fn(async (id: string) => fakeFiles.get(id)),
}))
vi.mock('@/db/database', () => ({
  db: {
    selectFrom: (table: string) => ({
      selectAll: () => ({
        where: (_col: string, _op: string, id: string) => ({
          executeTakeFirst: async () => (table === 'File' ? fakeFiles.get(id) : undefined),
        }),
      }),
      select: () => ({ where: () => ({ executeTakeFirst: async () => undefined }) }),
    }),
  },
}))
vi.mock('@/backend/lib/files/authorization', () => ({
  canAccessFile: vi.fn(async () => true),
}))
vi.mock('@/lib/textextraction/cache', () => ({
  cachingExtractor: {
    extractFromFile: vi.fn(async (fileEntry: { id: string }) => fakeFileTexts.get(fileEntry.id)),
  },
}))

// Real CompressedMessage cache, in-memory — exercises the actual cache-hit path across turns
// instead of forcing a rebuild every time, same as production.
vi.mock('@/models/compressed-message', () => ({
  getCompressedMessage: vi.fn(async (sourceMessageId: string, compressionVersion: number) => {
    const key = `${sourceMessageId}:${compressionVersion}`
    const content = compressedMessageStore.get(key)
    return content === undefined ? undefined : { sourceMessageId, compressionVersion, content, version: null }
  }),
  saveCompressedMessage: vi.fn(
    async (params: { sourceMessageId: string; compressionVersion: number; content: unknown }) => {
      compressedMessageStore.set(`${params.sourceMessageId}:${params.compressionVersion}`, params.content)
    }
  ),
}))

import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'
import { setTokenizerCounter } from '@/backend/lib/chat/prompt-token-counter'
import { countTextWithTokenizer } from '@/lib/chat/tokenizer'
import { ChatAssistant, type AssistantParams } from '@/backend/lib/chat'
import { ChatState } from '@/backend/lib/chat/ChatState'
import {
  planMessageCompression,
  applyCompressionPlan,
  warmCompressionCache,
} from '@/backend/lib/chat/compression-planner'
import { estimateHistoryMessageCosts } from '@/backend/lib/chat/token-estimator'
import type { ClientSink } from '@/backend/lib/chat/ClientSink'
import type { LlmModel } from '@/lib/chat/models'
import type { ToolFunctions, ToolImplementation } from '@/lib/chat/tools'
import type { ProviderConfig } from '@/types/provider'

const ENABLED = process.env.RUN_LLM_INTEGRATION === '1'

beforeEach(() => {
  fakeFiles.clear()
  fakeFileTexts.clear()
  compressedMessageStore.clear()
})

setTokenizerCounter({
  countText: async (tokenizer, text) => countTextWithTokenizer(tokenizer, text),
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeModel(model: string, provider: LlmModel['provider'], owned_by: LlmModel['owned_by']): LlmModel {
  return {
    id: model,
    model,
    name: model,
    description: 'benchmark',
    context_length: 128_000,
    capabilities: { vision: false, function_calling: true },
    provider,
    owned_by,
  }
}

/** Buffers streamed events, same shape as llm-integration.test.ts's TestSink. */
class TestSink implements ClientSink {
  readonly events: dto.TextStreamPart[] = []
  enqueue(event: dto.TextStreamPart) {
    this.events.push(event)
  }
  getText(): string {
    return this.events
      .filter((e): e is { type: 'text'; text: string } => e.type === 'text')
      .map((e) => e.text)
      .join('')
  }
  getToolCallNames(): string[] {
    return this.getToolCalls().map((c) => c.toolName)
  }
  /** Every tool call's name + args — used to check *which* files/messages were actually
   *  retrieved, not just that some call happened. */
  getToolCalls(): { toolName: string; args: Record<string, unknown> }[] {
    return this.events
      .filter((e) => e.type === 'part')
      .map((e) => (e as dto.TextStreamPart & { type: 'part'; part: dto.MessagePart }).part)
      .filter((p): p is dto.ToolCallPart => p.type === 'tool-call')
      .map((p) => ({ toolName: p.toolName, args: p.args }))
  }
  hasError(): boolean {
    return this.events.some(
      (e) => e.type === 'part' && (e as dto.TextStreamPart & { type: 'part'; part: dto.MessagePart }).part?.type === 'error'
    )
  }
}

/** Wraps a TestSink and mirrors every emitted event into a local ChatState, so the resulting
 *  full message history (assistant text, tool calls/results) can be threaded into the next turn —
 *  `processUserMessageWithSink` builds its own internal ChatState and doesn't return it. */
class TrackingSink implements ClientSink {
  readonly inner = new TestSink()
  readonly chatState: ChatState
  constructor(initialHistory: dto.Message[]) {
    this.chatState = new ChatState(initialHistory)
  }
  enqueue(event: dto.TextStreamPart) {
    this.chatState.applyStreamPart(event)
    this.inner.enqueue(event)
  }
  get history(): dto.Message[] {
    return this.chatState.chatHistory
  }
}

/** Checks that a specific context-retrieve *function* was called — not just "some context-retrieve
 *  call happened", which would also pass for e.g. a get_file call with a made-up id. `get_message`
 *  and `search` are the two message-level recovery paths (as opposed to `get_file`, which recovers
 *  a specific attached/generated file's content). */
function calledFunction(toolNames: string[], functionName: 'get_file' | 'get_message' | 'search'): boolean {
  return toolNames.some((name) => name.includes('context-retrieve') && name.includes(functionName))
}

function usesMessageRetrieval(toolNames: string[]): boolean {
  return calledFunction(toolNames, 'get_message') || calledFunction(toolNames, 'search')
}

/** Real tokenizer-based counts (same estimator `truncateChat` uses for real budget decisions) —
 *  not the planner's own rough chars/4 heuristic — for a trustworthy before/after comparison. */
async function reportTokenSavings(
  model: LlmModel,
  rawHistory: dto.Message[],
  compressedHistory: dto.Message[]
): Promise<{ beforeTokens: number; afterTokens: number; reductionPct: number }> {
  const sum = async (history: dto.Message[]) => {
    const costs = await estimateHistoryMessageCosts(model, history)
    return costs.reduce((total, c) => total + c.tokens, 0)
  }
  const beforeTokens = await sum(rawHistory)
  const afterTokens = await sum(compressedHistory)
  const reductionPct = beforeTokens === 0 ? 0 : Math.round((1 - afterTokens / beforeTokens) * 100)
  // eslint-disable-next-line no-console
  console.log(
    `[token savings] ${model.id}: before=${beforeTokens} tokens, after=${afterTokens} tokens, reduction=${reductionPct}%`
  )
  return { beforeTokens, afterTokens, reductionPct }
}

async function makeAssistant(
  config: ProviderConfig,
  model: LlmModel,
  tools: ToolImplementation[],
  preset: dto.ContextCompressionPreset
): Promise<ChatAssistant> {
  const assistantParams: AssistantParams = {
    assistantId: 'benchmark-assistant',
    model: model.model,
    systemPrompt:
      'You are a helpful assistant. Follow reply-format instructions exactly. ' +
      'If you are asked about a specific detail from an earlier point in the conversation and you ' +
      "are not certain of it from what's currently visible, use the context-retrieve tool to check " +
      'before answering — never guess or invent a plausible-sounding answer.',
    temperature: 0,
    tokenLimit: 32_000,
    reasoning_effort: null,
    contextCompression: { preset },
  }
  // Mirrors ChatAssistant.build()'s registration (bypassed here because build() looks models up
  // in the real `llmModels` registry, which we don't want to fake).
  const { ContextRetrievePlugin } = await import('@/backend/lib/tools/context-retrieve/implementation')
  const allTools = [
    ...tools,
    new ContextRetrievePlugin(
      {
        id: 'context-retrieve',
        provisioned: false,
        name: 'context-retrieve',
        promptFragment:
          "\nContext compression may replace older attachments, tool outputs, or long messages with a short summary that includes an id. Use the context-retrieve tool to recover the original: get_file(id) for a file, get_message(id) for a whole message, or search(query) to find a message when you don't already have its id.\n",
      },
      {}
    ),
  ]
  const computed = await ChatAssistant.computeFunctions(allTools, model, {
    userId: 'benchmark-user',
    assistantId: 'benchmark-assistant',
    rootOwner: { type: 'CHAT', id: 'conv-1' },
  })
  return new ChatAssistant(
    config,
    assistantParams,
    model,
    allTools,
    {
      user: 'benchmark-user',
      conversationId: 'conv-1',
      saveMessage: async (message) => {
        await warmCompressionCache(message)
      },
    },
    {},
    [],
    computed
  )
}

async function runTurn(
  assistant: ChatAssistant,
  history: dto.Message[],
  userContent: string,
  attachments: dto.Attachment[] = []
): Promise<{ sink: TestSink; history: dto.Message[] }> {
  const userMessage: dto.UserMessage = {
    id: nanoid(),
    conversationId: 'conv-1',
    parent: history.at(-1)?.id ?? null,
    sentAt: new Date().toISOString(),
    role: 'user',
    content: userContent,
    attachments,
  }
  const fullHistory = [...history, userMessage]
  const sink = new TrackingSink(fullHistory)
  await assistant.processUserMessageWithSink(fullHistory, sink)
  return { sink: sink.inner, history: sink.history }
}

/** Synthetic filler turns — no LLM calls, just bulk to push the conversation past
 *  DEFAULT_COMPRESSION_TRIGGER_TOKENS (6000 estimated tokens ≈ 24000 raw chars). */
function withFillerTurns(history: dto.Message[], pairs = 12): dto.Message[] {
  const filler = 'The quarterly widget report notes steady demand across all regions. '.repeat(30)
  let result = history
  for (let i = 0; i < pairs; i++) {
    const parent = result.at(-1)?.id ?? null
    const userMsg: dto.UserMessage = {
      id: `filler-u-${i}`,
      conversationId: 'conv-1',
      parent,
      sentAt: new Date().toISOString(),
      role: 'user',
      content: `Unrelated filler question ${i}. ${filler}`,
      attachments: [],
    }
    const assistantMsg: dto.AssistantMessage = {
      id: `filler-a-${i}`,
      conversationId: 'conv-1',
      parent: userMsg.id,
      sentAt: new Date().toISOString(),
      role: 'assistant',
      parts: [{ type: 'text', text: `Unrelated filler answer ${i}. ${filler}` }],
    }
    result = [...result, userMsg, assistantMsg]
  }
  return result
}

function buildReportParagraph(topic: string, index: number): string {
  return (
    `Section ${index}: ${topic}. During this period, the team reviewed operational metrics, ` +
    'stakeholder feedback, and process adherence across all relevant workstreams. Notes from the ' +
    'review are recorded for audit purposes and cross-referenced against prior reporting periods. ' +
    `No material deviations from the standard process were observed in section ${index}, and all ` +
    'action items identified during the review have been assigned an owner and a target date.'
  )
}

/** A multi-KB synthetic report, facts placed well past the 500-char inline-preview cutoff on both
 *  sides, so the savings from compressing it away are large and unambiguous. */
function buildLongReportText(title: string, topic: string, factsBlock: string[]): string {
  const before = Array.from({ length: 10 }, (_, i) => buildReportParagraph(topic, i + 1))
  const after = Array.from({ length: 10 }, (_, i) => buildReportParagraph(topic, 11 + i))
  return [title, '', ...before, '', ...factsBlock, '', ...after].join('\n\n')
}

// ---------------------------------------------------------------------------
// Fake tools
// ---------------------------------------------------------------------------

/** Deterministic fake image generator: no real image bytes, no file storage — the interesting
 *  part is that its result text (and the prompt in its own tool-call args) get compacted away,
 *  leaving only a `context-retrieve.get_message` reference behind. */
const generateImageTool: ToolImplementation = {
  toolParams: { id: 'generate-image', provisioned: false, promptFragment: '', name: 'generate_image' },
  supportedMedia: [],
  functions: async (): Promise<ToolFunctions> => ({
    generate_image: {
      description: 'Generate an image from a text prompt.',
      parameters: {
        type: 'object' as const,
        properties: { prompt: { type: 'string', description: 'Description of the image to generate' } },
        required: ['prompt'],
        additionalProperties: false,
      },
      invoke: async ({ params }) => ({
        type: 'content' as const,
        value: [
          {
            type: 'text' as const,
            text:
              'Generated image. ' +
              `Prompt used: "${params.prompt as string}". Style: watercolor, warm afternoon lighting, ` +
              'soft brush strokes, muted earth tones, gentle vignette. ' +
              // The one fact the follow-up turn probes for. Framed explicitly as tool-reported
              // metadata (not a visual detail one would need to *see* the image to know) — a first
              // version framed this as something "painted on" the bicycle, and vision-less models
              // reasonably refused to answer ("I can't see the image, so I can't verify that"),
              // never even considering that the fact was sitting in their own tool result's text.
              // Also deliberately not an id/code-shaped string — an opaque "IMG-xxxx"-style code
              // reads too similarly to the recovery note's own message id (also visible in the
              // compacted context) and models sometimes echoed the wrong one back.
              `The generation tool internally assigned this artwork the title "${IMAGE_HIDDEN_DETAIL}". ` +
              // Real image-gen APIs return verbose generation metadata (candidate variations,
              // safety scores, model/version info, seeds) — padded here so the result crosses the
              // planner's large-tool-output threshold, same as it realistically would in production.
              IMAGE_TOOL_METADATA_PADDING,
          },
        ],
      }),
    },
  }),
}

const IMAGE_HIDDEN_DETAIL = 'Windermere Dusk'

// ~9KB, matching the two-PDF scenario's scale — real image-gen APIs do return this much candidate
// metadata, and it's what makes the token savings from compressing it away actually significant
// rather than a rounding error.
const IMAGE_TOOL_METADATA_PADDING = Array.from(
  { length: 25 },
  (_, i) =>
    `Candidate variation ${i + 1}: seed ${1000 + i * 37}, model image-gen-v3, resolution 1024x1024, ` +
    `safety score 0.0${i % 9}, aesthetic score 8.${i % 10}, sampler DPM++2M, steps 30, guidance scale 7.5, ` +
    'color palette notes: muted earth tones with warm highlights, composition notes: rule-of-thirds ' +
    'framing with the subject slightly left of center, post-processing: mild film grain and vignette applied.'
).join(' ')

// ---------------------------------------------------------------------------
// Provider matrix (subset of llm-integration.test.ts's — only what's needed here)
// ---------------------------------------------------------------------------

type ProviderSpec = {
  name: string
  envKey: string
  config: () => ProviderConfig
  model: () => LlmModel
}

const providerSpecs: ProviderSpec[] = [
  {
    name: 'openai',
    envKey: 'OPENAI_API_KEY',
    config: () => ({
      providerType: 'openai',
      name: 'benchmark-openai',
      apiKey: process.env.OPENAI_API_KEY!,
      provisioned: false,
    }),
    model: () => makeModel(process.env.OPENAI_MODEL ?? 'gpt-4.1-mini', 'openai', 'openai'),
  },
  {
    name: 'anthropic',
    envKey: 'ANTHROPIC_API_KEY',
    config: () => ({
      providerType: 'anthropic',
      name: 'benchmark-anthropic',
      apiKey: process.env.ANTHROPIC_API_KEY!,
      provisioned: false,
    }),
    model: () => makeModel(process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001', 'anthropic', 'anthropic'),
  },
  {
    name: 'gemini',
    envKey: 'GEMINI_API_KEY',
    config: () => ({
      providerType: 'google-ai-studio',
      name: 'benchmark-gemini',
      apiKey: process.env.GEMINI_API_KEY!,
      provisioned: false,
    }),
    model: () => makeModel(process.env.GEMINI_MODEL ?? 'gemini-2.5-flash', 'google-ai-studio', 'gemini'),
  },
]

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe.skipIf(!ENABLED)('context compression benchmark', () => {
  for (const spec of providerSpecs) {
    const skip = !process.env[spec.envKey]

    describe.skipIf(skip)(spec.name, () => {
      // ── Scenario 1: generated image, detail recall ──────────────────────

      test(
        'recalls a detail from a generated image after the turn is compressed away',
        async () => {
          const assistant = await makeAssistant(spec.config(), spec.model(), [generateImageTool], 'conservative')

          // As in the document scenario: keep the reply generic so the assistant's own (never-
          // compressed) turn-1 message can't leak the hidden detail we probe for later.
          const turn1 = await runTurn(
            assistant,
            [],
            'Generate an image of a red vintage bicycle leaning against a white brick wall. ' +
              "Just briefly confirm when it's done — no need to describe what's in it."
          )
          expect(turn1.sink.hasError()).toBe(false)

          const padded = withFillerTurns(turn1.history)

          // Precondition: compression must actually mark the tool turn for summarization before
          // we even ask the model anything — isolates "did compression run" from "did the model cope".
          const decisions = planMessageCompression(padded, 'conservative')
          const toolMessage = turn1.history.find((m) => m.role === 'tool')!
          expect(decisions.find((d) => d.messageId === toolMessage.id)?.policy).toBe('summary')

          const compacted = await applyCompressionPlan(padded, decisions)
          const { beforeTokens, afterTokens, reductionPct } = await reportTokenSavings(
            spec.model(),
            padded,
            compacted
          )
          expect(afterTokens).toBeLessThan(beforeTokens)
          // A `content`-type tool result is dropped in full (not just truncated to a preview like
          // a text-only result would be) — with ~9KB of generation metadata behind it, the savings
          // should be substantial, not just technically-positive.
          expect(reductionPct).toBeGreaterThan(15)

          const turn2 = await runTurn(
            assistant,
            padded,
            'What internal title did the image generation tool assign to the image you generated ' +
              'earlier? Reply with ONLY that title, nothing else.'
          )
          expect(turn2.sink.hasError()).toBe(false)
          expect(turn2.sink.getText()).toContain(IMAGE_HIDDEN_DETAIL)
          // No file exists for this message (the tool result never had a file item) — get_file
          // isn't even a valid path here. This must have come from get_message or search.
          expect(usesMessageRetrieval(turn2.sink.getToolCallNames())).toBe(true)
        },
        120_000
      )

      // ── Scenario 2: uploaded document, multiple retrieval questions ─────

      test(
        'recalls multiple facts from an uploaded document after the turn is compressed away',
        async () => {
          const docFileId = 'doc-confirmation-1'
          fakeFiles.set(docFileId, {
            id: docFileId,
            name: 'reservation.txt',
            type: 'text/plain',
            path: `files/${docFileId}.txt`,
            encryption: null,
            size: 2200,
            origin: 'uploaded',
            // Non-null: token-estimator's text-fallback path (and context-retrieve's own File/
            // FileBlob lookup, both mocked above) short-circuit to zero tokens when this is null —
            // see reportTokenSavings.
            fileBlobId: 'fake-blob-doc-1',
          })
          // A realistically-sized document (a few KB, not five lines) — real savings only show up
          // once the omitted content is large enough that it dwarfs the fixed reference/note
          // overhead added back in; a tiny fixture would make compression a net token loss.
          //
          // The facts block is deliberately placed *after* ~1000 characters of preamble: the
          // inline text preview compression keeps visible even in a `summary` (see
          // buildInlineTextSummary in compression-planner.ts) is capped at 500 characters, so
          // placing the facts earlier would let the model answer straight from the compacted
          // preview without ever calling context-retrieve — which would silently defeat the
          // "did retrieval actually happen" assertion below.
          fakeFileTexts.set(
            docFileId,
            [
              'GRAND HARBOR HOTEL — RESERVATION CONFIRMATION',
              '',
              'Dear Guest,',
              '',
              'Thank you for choosing Grand Harbor Hotel for your upcoming stay. We are delighted to ' +
                'confirm the details of your reservation and look forward to welcoming you soon. Please ' +
                'find your reservation details below, and keep this confirmation for your records — you ' +
                'may be asked to present it at check-in along with a valid photo ID and the credit card ' +
                'used to guarantee the booking.',
              '',
              'Hotel amenities included in your stay: complimentary high-speed WiFi throughout the ' +
                'property, access to the rooftop infinity pool and adjoining sun deck, full use of the ' +
                'fitness center and sauna, and a daily continental breakfast served in the Harbor View ' +
                'restaurant from 6:30 to 10:30. Valet parking is available for an additional nightly fee, ' +
                'and self-parking is offered at a reduced rate for registered guests.',
              '',
              'Confirmation Number: RJ-88214',
              'Check-in: 2026-04-02 (from 15:00)',
              'Check-out: 2026-04-06 (until 11:00)',
              'Room type: Deluxe King Suite',
              'Number of guests: 2 adults',
              'Rate plan: Best Available Rate, non-refundable',
              'Total amount due: $842.50',
              '',
              'Cancellation policy: this rate is non-refundable. Changes to the reservation dates may ' +
                'be requested up to 48 hours before check-in, subject to availability, and may result in ' +
                'a rate adjustment. No-shows will be charged the full amount of the stay.',
              '',
              'Special requests noted on this reservation: late checkout requested (subject to ' +
                'availability on the day), extra pillows, and a high floor if possible. Special requests ' +
                'are not guaranteed and are fulfilled on a best-effort basis by the front desk team.',
              '',
              'Local information: the hotel is a fifteen-minute walk from the historic harbor district ' +
                'and its collection of seafood restaurants, a short taxi ride from the central train ' +
                'station, and approximately forty minutes from the international airport by car. The ' +
                'concierge desk can arrange airport transfers, guided walking tours of the old town, and ' +
                'reservations at nearby restaurants on request.',
              '',
              'If any of the details above are incorrect, or if you need to make changes to your ' +
                'reservation, please contact our reservations team as soon as possible so we can assist ' +
                'you before your arrival date. We look forward to welcoming you to Grand Harbor Hotel.',
              '',
              'Warm regards,',
              'Grand Harbor Hotel Reservations Team',
            ].join('\n')
          )

          const assistant = await makeAssistant(spec.config(), spec.model(), [], 'conservative')

          // Deliberately does not ask about any fact we'll probe for later: assistant messages are
          // never compressed (only user/tool roles are), so if the assistant's own turn-1 reply
          // restated a fact, it would stay visible verbatim forever — making the later "did it
          // actually retrieve this" assertion meaningless.
          const turn1 = await runTurn(
            assistant,
            [],
            "I'm attaching my hotel reservation confirmation for my records. Reply with only the " +
              "word \"Received\" — don't repeat or summarize anything from the document.",
            [{ id: docFileId, mimetype: 'text/plain', name: 'reservation.txt', size: 2200 }]
          )
          expect(turn1.sink.hasError()).toBe(false)
          expect(compressedMessageStore.has(`${turn1.history.find((m) => m.role === 'user')!.id}:2`)).toBe(true)

          const padded = withFillerTurns(turn1.history)

          const decisions = planMessageCompression(padded, 'conservative')
          const uploadMessage = turn1.history.find((m) => m.role === 'user')!
          expect(decisions.find((d) => d.messageId === uploadMessage.id)?.policy).toBe('summary')

          const compacted = await applyCompressionPlan(padded, decisions)
          const { beforeTokens, afterTokens } = await reportTokenSavings(spec.model(), padded, compacted)
          expect(afterTokens).toBeLessThan(beforeTokens)

          const turn2 = await runTurn(
            assistant,
            padded,
            'What was the confirmation number in the document I uploaded earlier? Reply with ONLY the number.'
          )
          expect(turn2.sink.hasError()).toBe(false)
          expect(turn2.sink.getText()).toContain('RJ-88214')
          // get_message alone can't reveal document content (only its descriptor) — this must be
          // get_file actually reading the attachment back.
          expect(calledFunction(turn2.sink.getToolCallNames(), 'get_file')).toBe(true)

          const turn3 = await runTurn(
            assistant,
            turn2.history,
            'And per that same document, what was the total amount due? Reply with ONLY the amount.'
          )
          expect(turn3.sink.hasError()).toBe(false)
          expect(turn3.sink.getText()).toContain('842.50')
          expect(calledFunction(turn3.sink.getToolCallNames(), 'get_file')).toBe(true)
        },
        180_000
      )

      // ── Scenario 3: two uploaded PDFs, a question requiring both ────────

      test(
        'coordinates facts across two uploaded documents after both turns are compressed away',
        async () => {
          const fileA = 'doc-q3-financial'
          const fileB = 'doc-q4-vendors'

          fakeFiles.set(fileA, {
            id: fileA,
            name: 'q3-financial-report.pdf',
            type: 'application/pdf',
            path: `files/${fileA}.pdf`,
            encryption: null,
            size: 9000,
            origin: 'uploaded',
            fileBlobId: 'fake-blob-q3',
          })
          fakeFileTexts.set(
            fileA,
            buildLongReportText('NORTHWIND ANALYTICS — Q3 FINANCIAL REPORT', 'Q3 financial review', [
              'Total R&D expenditure for Q3: $2,145,300.',
            ])
          )

          fakeFiles.set(fileB, {
            id: fileB,
            name: 'q4-vendor-contracts.pdf',
            type: 'application/pdf',
            path: `files/${fileB}.pdf`,
            encryption: null,
            size: 9000,
            origin: 'uploaded',
            fileBlobId: 'fake-blob-q4',
          })
          fakeFileTexts.set(
            fileB,
            buildLongReportText('NORTHWIND ANALYTICS — Q4 VENDOR CONTRACTS SUMMARY', 'Q4 vendor contract review', [
              'Meridian Systems contract renewal date: 2027-01-15.',
            ])
          )

          const assistant = await makeAssistant(spec.config(), spec.model(), [], 'conservative')

          const turn1 = await runTurn(
            assistant,
            [],
            "I'm attaching our Q3 financial report. Reply with only the word \"Received\" — don't " +
              'repeat or summarize anything from the document.',
            [{ id: fileA, mimetype: 'application/pdf', name: 'q3-financial-report.pdf', size: 9000 }]
          )
          expect(turn1.sink.hasError()).toBe(false)

          const turn2 = await runTurn(
            assistant,
            turn1.history,
            "I'm attaching our Q4 vendor contracts summary. Reply with only the word \"Received\" — " +
              "don't repeat or summarize anything from the document.",
            [{ id: fileB, mimetype: 'application/pdf', name: 'q4-vendor-contracts.pdf', size: 9000 }]
          )
          expect(turn2.sink.hasError()).toBe(false)

          const padded = withFillerTurns(turn2.history)

          const decisions = planMessageCompression(padded, 'conservative')
          const upload1 = turn1.history.find((m) => m.role === 'user')!
          const upload2 = turn2.history.filter((m) => m.role === 'user').at(-1)!
          expect(decisions.find((d) => d.messageId === upload1.id)?.policy).toBe('summary')
          expect(decisions.find((d) => d.messageId === upload2.id)?.policy).toBe('summary')

          const compacted = await applyCompressionPlan(padded, decisions)
          const { beforeTokens, afterTokens, reductionPct } = await reportTokenSavings(
            spec.model(),
            padded,
            compacted
          )
          expect(afterTokens).toBeLessThan(beforeTokens)
          // With two multi-KB documents compressed away, savings should be substantial — not just
          // "technically less".
          expect(reductionPct).toBeGreaterThan(20)

          const turn3 = await runTurn(
            assistant,
            padded,
            "Reply in the exact format 'EXPENDITURE | RENEWAL_DATE' with: the total R&D expenditure " +
              'from the Q3 financial report, and the renewal date for the Meridian Systems vendor ' +
              'contract from the Q4 vendor contracts summary. Nothing else in your reply.'
          )
          expect(turn3.sink.hasError()).toBe(false)
          const answer = turn3.sink.getText()
          expect(answer).toContain('2,145,300')
          expect(answer).toContain('2027-01-15')

          // Coordination proof: both documents must have actually been retrieved, not just one
          // (which could make a lucky guess look like success) or neither (a hallucination that
          // happens to match both facts).
          const retrievedFileIds = turn3.sink
            .getToolCalls()
            .filter((c) => c.toolName.includes('context-retrieve') && c.toolName.includes('get_file'))
            .map((c) => c.args.id)
          expect(retrievedFileIds).toContain(fileA)
          expect(retrievedFileIds).toContain(fileB)
        },
        180_000
      )
    })
  }
})
