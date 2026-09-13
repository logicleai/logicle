/**
 * Small, source-grounded LLM probes for the accepted context/knowledge corpus.
 *
 * These are deliberately not replays of the production bundles: the bundles stay outside the
 * repository and the expensive replay campaign remains the investigation tool. This suite keeps
 * a few sanitized, adversarial fixtures that represent the corpus' behavioural groups. Forced
 * probes isolate whether the model uses returned evidence correctly; unforced probes test the
 * model's decision to retrieve (and to avoid retrieval when it is unnecessary). There is no LLM
 * judge here.
 *
 * Run the live probes explicitly, using the cheap first backend by default:
 *   RUN_LLM_INTEGRATION=1 LLM_RETRIEVAL_PROBES=1 pnpm vitest run __tests__/llm-knowledge-probes.test.ts
 *   LLM_PROBE_MODEL=gpt-4.1-mini ...
 */

import { beforeAll, describe, expect, test, vi } from 'vitest'

const { mockSearchBox } = vi.hoisted(() => ({ mockSearchBox: vi.fn() }))

vi.mock('@/lib/env', () => ({
  default: {
    dumpLlmConversation: false,
    allowMockProvider: false,
    chat: {
      autoSummary: { enable: false },
      maxOutputTokens: undefined,
      disableParallelToolCalls: false,
    },
    knowledge: { sendInPrompt: false },
    fileStorage: { encryptFiles: false },
    tools: { websearch: { defaultApiUrl: '' }, prefixFunctionNames: false },
    promptCaching: { anthropic: { preamble: 'none', automatic: 'none' }, openai: 'none' },
  },
}))
vi.mock('@/lib/logging', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), log: vi.fn() },
  loggingFetch: undefined,
}))
vi.mock('@/lib/satellite/hub', () => ({ connections: [], callSatelliteMethod: vi.fn() }))
vi.mock('@/lib/storage', () => ({ storage: { writeBuffer: vi.fn() } }))
vi.mock('@/models/file', () => ({ addFile: vi.fn(), getFileWithId: vi.fn() }))
vi.mock('@/lib/models', () => ({ llmModels: [] }))
vi.mock('@/models/backend', () => ({ getBackends: vi.fn().mockResolvedValue([]) }))
vi.mock('@/models/user', () => ({}))
vi.mock('@/db/database', () => ({ db: {} }))
vi.mock('@/db/dialect', () => ({ createDialect: () => null }))
vi.mock('@/backend/lib/files/authorization', () => ({ canAccessFile: vi.fn() }))
vi.mock('@/backend/lib/knowledge/retrieval', () => ({
  searchBox: (...args: unknown[]) => mockSearchBox(...args),
  searchBoxDocuments: vi.fn().mockResolvedValue([]),
}))
vi.mock('@/backend/lib/knowledge/store', () => ({
  listBoxDocuments: vi.fn().mockResolvedValue([]),
  loadBoxProjections: vi.fn().mockResolvedValue([]),
  loadFileChunkRange: vi.fn().mockResolvedValue([]),
}))

import * as dto from '@/types/dto'
import { setTokenizerCounter } from '@/backend/lib/chat/prompt-token-counter'
import { countTextWithTokenizer } from '@/lib/chat/tokenizer'
import { ChatAssistant, type AssistantParams } from '@/backend/lib/chat'
import { KnowledgeBoxTool } from '@/backend/lib/tools/knowledge_box/implementation'
import type { ClientSink } from '@/backend/lib/chat/ClientSink'
import type { LlmModel } from '@/lib/chat/models'
import type { ToolFunctions, ToolImplementation } from '@/lib/chat/tools'
import type { ProviderConfig } from '@/types/provider'

const ENABLED = process.env.RUN_LLM_INTEGRATION === '1' && process.env.LLM_RETRIEVAL_PROBES === '1'

beforeAll(() => {
  setTokenizerCounter({
    countText: async (tokenizer, text) => countTextWithTokenizer(tokenizer, text),
  })
})

// This is the accepted external corpus' coverage ledger. IDs are intentionally only identifiers:
// no production prompts, replies, tenant names, files, or raw bundles are copied into the repo.
const datasetProbeCoverage = [
  {
    probe: 'compression-attachment-follow-up',
    cases: ['001', '002', '003', '004', '016', '017', '018', '022', '026'],
  },
  { probe: 'compression-long-history', cases: ['005', '006', '011', '013', '014', '015', '025'] },
  { probe: 'compression-negative-control', cases: ['007', '008', '009', '010', '012'] },
  { probe: 'compression-correctness-sensitive', cases: ['024'] },
  { probe: 'knowledge-legal-distinction', cases: ['019', '021'] },
  { probe: 'knowledge-source-boundary', cases: ['020', '023'] },
  { probe: 'knowledge-visual-document-match', cases: ['027', '028'] },
] as const

describe('accepted dataset coverage ledger', () => {
  test('accounts for every accepted case exactly once as a primary probe', () => {
    const primaryCases = datasetProbeCoverage.flatMap(({ cases }) => cases)
    expect(new Set(primaryCases).size).toBe(28)
    expect([...primaryCases].sort()).toEqual(
      Array.from({ length: 28 }, (_, index) => String(index + 1).padStart(3, '0')).sort()
    )
  })
})

function makeModel(): LlmModel {
  const model = process.env.LLM_PROBE_MODEL ?? 'gpt-4o-mini'
  return {
    id: model,
    model,
    name: model,
    description: 'cheap deterministic retrieval probe',
    context_length: 128_000,
    capabilities: { vision: false, function_calling: true },
    provider: 'openai',
    owned_by: 'openai',
  }
}

const config = (): ProviderConfig => ({
  providerType: 'openai',
  name: 'llm-retrieval-probes',
  apiKey: process.env.OPENAI_API_KEY!,
  provisioned: false,
})

class ProbeSink implements ClientSink {
  readonly events: dto.TextStreamPart[] = []

  enqueue(event: dto.TextStreamPart) {
    this.events.push(event)
  }

  text() {
    return this.events
      .filter((event): event is { type: 'text'; text: string } => event.type === 'text')
      .map((event) => event.text)
      .join('')
  }

  parts() {
    return this.events
      .filter((event) => event.type === 'part')
      .map((event) => (event as dto.TextStreamPart & { type: 'part'; part: dto.MessagePart }).part)
  }

  toolCalls() {
    return this.parts()
      .filter((part): part is dto.ToolCallPart => part.type === 'tool-call')
      .map(({ toolName, args }) => ({ toolName, args }))
  }

  toolResults() {
    return this.parts()
      .filter((part): part is dto.ToolCallResultPart => part.type === 'tool-result')
      .map(({ toolName, result }) => ({ toolName, result }))
  }

  hasError() {
    return this.parts().some((part) => part.type === 'error')
  }
}

interface ProbeSource {
  fileId: string
  fileName: string
  text: string
  mimeType?: string
}

interface ProbeAssistantOptions {
  forceRetrieval?: boolean
  systemPrompt?: string
}

const answerCheckTool: ToolImplementation = {
  toolParams: {
    id: 'answer-check',
    name: 'answer-check',
    provisioned: false,
    promptFragment: '',
  },
  supportedMedia: [],
  functions: async (): Promise<ToolFunctions> => ({
    submit_answer: {
      description: 'Submit the answer found for verification.',
      parameters: {
        type: 'object' as const,
        properties: {
          answer: { type: 'string', description: 'The answer found in the knowledge source.' },
        },
        required: ['answer'],
        additionalProperties: false,
      },
      invoke: async () => ({ type: 'text' as const, value: 'Answer recorded for verification.' }),
    },
  }),
}

function makeKnowledgeTool(
  sourceText: string,
  additionalSources: ProbeSource[] = []
): ToolImplementation {
  const sources: ProbeSource[] = [
    {
      fileId: 'probe-source',
      fileName: 'reviewed-source.pdf',
      mimeType: 'application/pdf',
      text: sourceText,
    },
    ...additionalSources,
  ]
  mockSearchBox.mockReset().mockResolvedValue(
    sources.map(({ fileId, fileName, text }) => ({
      fileId,
      seq: 0,
      heading: fileId === 'probe-source' ? 'Reviewed evidence' : 'Document evidence',
      text,
      score: fileId === 'probe-source' ? 1 : 0.9,
    }))
  )

  return new KnowledgeBoxTool(
    { id: 'probe-box', name: 'knowledge_box', provisioned: false, promptFragment: '' },
    {
      files: sources.map(({ fileId, fileName, mimeType, text }) => ({
        id: fileId,
        name: fileName,
        type: mimeType ?? 'text/plain',
        size: text.length,
      })),
      questions: [],
      maxSearchResults: 4,
    }
  )
}

async function makeAssistant(
  tool: ToolImplementation,
  options: ProbeAssistantOptions = {}
): Promise<ChatAssistant> {
  const model = makeModel()
  const assistantParams: AssistantParams = {
    assistantId: 'llm-retrieval-probe',
    model: model.model,
    systemPrompt:
      options.systemPrompt ??
      'You are a source-grounded retrieval test. The user message never contains the answer. ' +
        'You MUST use the supplied retrieval tool before answering. After the tool result arrives, ' +
        'use only that result as evidence. Follow the requested output format exactly. Never invent ' +
        'a missing figure; say that the source does not establish it.',
    temperature: 0,
    tokenLimit: 1200,
    reasoning_effort: null,
    contextCompression: null,
    // Consumed for the first model step only; ChatAssistant resumes auto mode after tool output.
    ...(options.forceRetrieval === false
      ? {}
      : { toolChoice: { type: 'tool', toolName: 'search' } }),
  }
  const computed = await ChatAssistant.computeFunctions([tool, answerCheckTool], model, {
    userId: 'llm-retrieval-probe-user',
    assistantId: assistantParams.assistantId,
  })
  return new ChatAssistant(
    config(),
    assistantParams,
    model,
    [tool, answerCheckTool],
    { user: 'llm-retrieval-probe-user' },
    {},
    [],
    computed
  )
}

async function runProbe(
  tool: ToolImplementation,
  prompt: string,
  options: ProbeAssistantOptions = {}
): Promise<ProbeSink> {
  const assistant = await makeAssistant(tool, options)
  const message: dto.UserMessage = {
    id: 'probe-user-message',
    conversationId: 'probe-conversation',
    parent: null,
    sentAt: new Date().toISOString(),
    role: 'user',
    content: prompt,
    attachments: [],
  }
  const sink = new ProbeSink()
  await assistant.processUserMessageWithSink([message], sink)
  return sink
}

function submittedAnswers(sink: ProbeSink): string[] {
  return sink
    .toolCalls()
    .filter(({ toolName }) => toolName.includes('submit_answer'))
    .map(({ args }) => String(args.answer ?? ''))
}

function searchCalls(sink: ProbeSink) {
  return sink.toolCalls().filter(({ toolName }) => toolName === 'search')
}

describe.skipIf(!ENABLED || !process.env.OPENAI_API_KEY)('live retrieval probes', () => {
  test('chooses knowledge retrieval when the answer is absent from the user message', async () => {
    const sink = await runProbe(
      makeKnowledgeTool(
        'Evidence token: NATURAL-RETRIEVAL. The signed policy has a one-year duration and no automatic renewal.'
      ),
      'The answer is intentionally not written in my message. Check the knowledge box if you need the reviewed source, then call answer-check.submit_answer with the policy duration, renewal status, and exact evidence token.',
      {
        forceRetrieval: false,
        systemPrompt:
          'Answer accurately. The knowledge box is available for source-dependent questions. ' +
          'Use it when the user message does not establish the answer; do not guess. ' +
          'After retrieval, use only the retrieved evidence for source-specific claims.',
      }
    )

    expect(sink.hasError()).toBe(false)
    expect(sink.toolCalls().some(({ toolName }) => toolName === 'search')).toBe(true)
    expect(mockSearchBox).toHaveBeenCalled()
    expect(
      sink.toolResults().some(({ result }) => JSON.stringify(result).includes('NATURAL-RETRIEVAL'))
    ).toBe(true)
    const answer = submittedAnswers(sink).join(' ').toLowerCase()
    expect(answer).toMatch(/one.year|one year/)
    expect(answer).toMatch(/no automatic renewal|does not renew|not renew/)
  }, 30_000)

  test('retrieves the requested record instead of returning a neighbouring phone number', async () => {
    const lucaNumber = '+39 02 555 0101'
    const otherNumber = '+39 02 555 0199'
    const sink = await runProbe(
      makeKnowledgeTool(
        `Phone directory PDF. Luca — ${lucaNumber}. Marco — ${otherNumber}. The numbers are office contacts; preserve the country code and all digits.`
      ),
      'Look up Luca in the phone-directory PDF, then call answer-check.submit_answer with only Luca’s complete phone number, with no name, explanation, or other contact.',
      { forceRetrieval: false }
    )

    const searchCalls = sink.toolCalls().filter(({ toolName }) => toolName === 'search')
    expect(sink.hasError()).toBe(false)
    expect(searchCalls.length).toBeGreaterThanOrEqual(1)
    expect(String(searchCalls[0]?.args.query)).toMatch(/luca/i)
    const searchArgs = mockSearchBox.mock.calls[0] as [string, string, number, string[] | undefined]
    expect(searchArgs[0]).toBe('probe-box')
    expect(searchArgs[1]).toMatch(/luca/i)
    expect(searchArgs[2]).toBe(4)
    if (searchArgs[3] !== undefined) expect(searchArgs[3]).toContain('probe-source')
    expect(submittedAnswers(sink)).toContain(lucaNumber)
    expect(submittedAnswers(sink).join(' ')).not.toContain(otherNumber)
  }, 30_000)

  test('does not retrieve when the user supplied a self-contained non-source question', async () => {
    const sink = await runProbe(
      makeKnowledgeTool('Evidence token: SHOULD-NOT-BE-USED. This source is unrelated arithmetic.'),
      'This is a self-contained arithmetic question. What is 17 plus 25? Call answer-check.submit_answer with only the number; do not use the knowledge box.',
      {
        forceRetrieval: false,
        systemPrompt:
          'Answer self-contained questions directly. Use the knowledge box only when the answer ' +
          'depends on a source in it, and never retrieve for ordinary arithmetic.',
      }
    )

    expect(sink.hasError()).toBe(false)
    expect(sink.toolCalls().some(({ toolName }) => toolName === 'search')).toBe(false)
    expect(mockSearchBox).not.toHaveBeenCalled()
    expect(submittedAnswers(sink)).toContain('42')
  }, 30_000)

  test('preserves a legal distinction after mandatory knowledge retrieval', async () => {
    const sink = await runProbe(
      makeKnowledgeTool(
        'Evidence token: A26-3-ONE-YEAR. A subsequent agreement after one year is outside the ordinary art. 26(2) reduction. The reviewed commentary says the credit note concerns the taxable amount only. Art. 26(3-bis) is a separate non-payment regime with objective prerequisites.'
      ),
      'Use a focused search query containing a subject term such as "art. 26", "subsequent agreement", or "non-payment". Then call answer-check.submit_answer with two short bullets explaining the source distinction. The first bullet must start with the exact evidence token from the retrieved passage, followed by the phrase "taxable amount only".'
    )

    expect(sink.hasError()).toBe(false)
    expect(searchCalls(sink).length).toBeGreaterThanOrEqual(1)
    expect(String(searchCalls(sink)[0]?.args.query)).toMatch(/agreement|art|one.year/i)
    expect(mockSearchBox).toHaveBeenCalledOnce()
    expect(
      sink.toolResults().some(({ result }) => JSON.stringify(result).includes('A26-3-ONE-YEAR'))
    ).toBe(true)
    const answer = submittedAnswers(sink).join(' ')
    expect(answer).toContain('26(3-bis)')
    expect(answer.toLowerCase()).toContain('taxable amount only')
  }, 30_000)

  test('does not merge a superseded document version into the current answer', async () => {
    const sink = await runProbe(
      makeKnowledgeTool(
        'Evidence token: CURRENT-SIGNED-VERSION. The signed 2026 policy supersedes all drafts and sets the renewal date to 2027-01-15.',
        [
          {
            fileId: 'draft-source',
            fileName: 'policy-draft.pdf',
            text: 'Evidence token: OLD-DRAFT-VERSION. An unsigned 2025 draft proposed renewal on 2026-01-15, but it was superseded and must not be used.',
          },
        ]
      ),
      'Search for the signed current policy, not an old draft. Call answer-check.submit_answer with only the renewal date from the signed 2026 policy and the exact evidence token that supports it.'
    )

    expect(sink.hasError()).toBe(false)
    expect(searchCalls(sink)[0]?.toolName).toBe('search')
    expect(String(searchCalls(sink)[0]?.args.query)).toMatch(/signed|current|policy/i)
    const answer = submittedAnswers(sink).join(' ')
    expect(answer).toContain('CURRENT-SIGNED-VERSION')
    expect(answer).toMatch(/2027-01-15|January 15, 2027|15 January 2027/i)
    expect(answer).not.toContain('2026-01-15')
  }, 30_000)

  test('does not turn a knowledge-box source boundary into an invented figure', async () => {
    const sink = await runProbe(
      makeKnowledgeTool(
        'Evidence token: VAT-SOURCE-ONLY. The reviewed documents establish a VAT limitation for the leased vehicle and discuss medical exemption/pro-rata treatment. They do not establish an IRPEF percentage or an IRPEF monetary ceiling.'
      ),
      'Answer the VAT part from the evidence and include the exact evidence token from the retrieved passage. For the IRPEF percentage and monetary ceiling, call answer-check.submit_answer and say exactly that the reviewed source does not establish them. Do not provide any guessed number.'
    )

    const answer = submittedAnswers(sink).join(' ').toLowerCase()
    expect(sink.hasError()).toBe(false)
    expect(searchCalls(sink).length).toBeGreaterThanOrEqual(1)
    expect(String(searchCalls(sink)[0]?.args.query)).toMatch(/irpef|vat|vehicle|leased/i)
    expect(
      sink.toolResults().some(({ result }) => JSON.stringify(result).includes('VAT-SOURCE-ONLY'))
    ).toBe(true)
    expect(answer).toMatch(
      /does not establish|not establish|not specified|not stated|cannot establish/
    )
    expect(answer).not.toMatch(/20\s*%|18[,.]075[,.]99|18[,.]075/)
  }, 30_000)

  test('uses visual landmarks to select the matching catalogue document', async () => {
    const sink = await runProbe(
      makeKnowledgeTool(
        'Evidence token: GUBI-11482-PAGE-71. The catalogue entry for the un-upholstered Bat chair with conic metal base is model 11482: 57 cm wide, 61 cm deep, 83 cm high, seat height 43.5 cm, weight 8.6 kg. Nearby upholstered variants are different products.'
      ),
      'A user photo shows an un-upholstered Bat chair with a conic metal base. Search the knowledge source, then call answer-check.submit_answer with the exact evidence token and the five measurements from the matching catalogue entry.'
    )

    expect(sink.hasError()).toBe(false)
    expect(searchCalls(sink)).toHaveLength(1)
    expect(String(searchCalls(sink)[0]?.args.query)).toMatch(/bat|chair|conic|base/i)
    const answer = submittedAnswers(sink).join(' ')
    expect(answer).toContain('43.5 cm')
    expect(answer).toContain('8.6 kg')
    expect(answer).not.toContain('43.5 kg')
  }, 30_000)
})
