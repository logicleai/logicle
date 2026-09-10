/**
 * Replays the production turns in an offline bundle locally, with compression off and on.
 *
 * Input is a bundle built by `eval-build-replay-bundle.ts`: a self-contained SQLite file with the
 * selected conversations and every attachment's bytes. This runner copies it to a scratch
 * directory, points the app at that copy and at `FILE_STORAGE_LOCATION=replaydb:` (bytes served
 * straight from the bundle), and makes fresh provider calls to compare responses and cost. It
 * never touches any source deployment, S3, or the network beyond the LLM provider.
 *
 * Usage:
 *   OPENAI_API_KEY=... npx tsx apps/backend/scripts/eval-replay-production-chats.ts \
 *     --bundle bundle.sqlite --out replay-results.json --report replay-report.md
 *
 * Flags:
 *   --bundle <path>             offline bundle from eval-build-replay-bundle.ts (required)
 *   --out <path>                JSON results, including production text (required)
 *   --report <path>             human-readable Markdown report (required)
 *   --provider <type>           override bundle provider: openai | anthropic | google-ai-studio
 *   --model <id>                override the assistant model for every replay
 *   --judge-model <id>          comparison judge model (default: replay model)
 *   --no-judge                  record cost/results without LLM failure classification
 *   --preset <name>             conservative | aggressive (default: conservative)
 *   --keep-recent-turns <n>     completed turns retained verbatim (default: 0)
 *   --trigger-at-tokens <n>     compression floor and trigger (default: 6000)
 *   --retrieval-mode <mode>     prefetch | tool (default: prefetch)
 */

export {}

import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type * as dto from '@/types/dto'
import type { Message as DbMessage } from '@/db/schema'
import type { ProviderType } from '@/types/provider'
import { computeCostUsd, formatCostUsd } from '@/backend/lib/eval/cost'
import type { ProductionReplayCase, ReplayJudgment } from '@/backend/lib/eval/productionChatReplay'
import type { TurnUsage } from '@/backend/lib/eval/types'

const args = process.argv.slice(2).filter((arg) => arg !== '--')
const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}
const bool = (name: string) => args.includes(`--${name}`)

const bundlePath = flag('bundle')
const out = flag('out')
const reportPath = flag('report')
if (!bundlePath || !out || !reportPath) {
  console.error('Usage: --bundle <bundle.sqlite> --out <results.json> --report <report.md>')
  process.exit(1)
}

const triggerAtTokens = Number(flag('trigger-at-tokens') ?? 6000)
const keepRecentTurns = Number(flag('keep-recent-turns') ?? 0)
const preset = flag('preset') ?? 'conservative'
const retrievalMode = flag('retrieval-mode') ?? 'prefetch'
if (!Number.isInteger(triggerAtTokens) || triggerAtTokens < 1) {
  console.error('--trigger-at-tokens must be a positive integer')
  process.exit(1)
}
if (!Number.isInteger(keepRecentTurns) || keepRecentTurns < 0) {
  console.error('--keep-recent-turns must be a non-negative integer')
  process.exit(1)
}
if (preset !== 'conservative' && preset !== 'aggressive') {
  console.error('--preset must be conservative or aggressive')
  process.exit(1)
}
if (retrievalMode !== 'prefetch' && retrievalMode !== 'tool') {
  console.error('--retrieval-mode must be prefetch or tool')
  process.exit(1)
}

// Work on a copy so a failed run never corrupts the bundle. Configure the app before imports.
const workdir = mkdtempSync(path.join(tmpdir(), 'logicle-production-replay-'))
const replayDbPath = path.join(workdir, 'replay.sqlite')
copyFileSync(bundlePath, replayDbPath)
process.env.DATABASE_URL = `file://${replayDbPath}`
process.env.FILE_STORAGE_LOCATION = 'replaydb:'
process.env.CHAT_CONTEXT_COMPRESSION_TRIGGER_TOKENS = String(triggerAtTokens)

const { db } = await import('@/db/database')
const { dtoMessageFromDbMessage } = await import('@/models/utils')
const { renderMessagePlainText } = await import('@/backend/lib/chat/message-projection')
const { ChatAssistant } = await import('@/backend/lib/chat')
const { EvalSink } = await import('@/backend/lib/eval/sink')
const { estimateHistoryMessageCosts } = await import('@/backend/lib/chat/token-estimator')
const { setTokenizerCounter } = await import('@/backend/lib/chat/prompt-token-counter')
const { countTextWithTokenizer } = await import('@/lib/chat/tokenizer')
const { llmModels } = await import('@/lib/models')
const { createReplayJudge } = await import('@/backend/lib/eval/productionChatReplay')
const { applyCompressionPlan, planMessageCompression } = await import(
  '@/backend/lib/chat/compression-planner'
)

setTokenizerCounter({
  countText: async (tokenizer, text) => countTextWithTokenizer(tokenizer, text),
})

// --- reconstruct the replay cases from the bundle ---
const cases: ProductionReplayCase[] = []
const audits = await db
  .selectFrom('MessageAudit')
  .selectAll()
  .where('type', '=', 'user')
  .orderBy('tokens', 'desc')
  .execute()

for (const audit of audits) {
  const conversationMessages = await db
    .selectFrom('Message')
    .selectAll()
    .where('conversationId', '=', audit.conversationId)
    .execute()
  const byId = new Map(conversationMessages.map((message) => [message.id, message]))

  const lineageRows: DbMessage[] = []
  let cursor = byId.get(audit.messageId)
  while (cursor) {
    lineageRows.push(cursor)
    cursor = cursor.parent ? byId.get(cursor.parent) : undefined
  }
  lineageRows.reverse()
  if (lineageRows.length === 0) continue
  const messages = lineageRows.map(dtoMessageFromDbMessage)

  const assistant = await db
    .selectFrom('Assistant')
    .innerJoin('AssistantVersion', 'AssistantVersion.id', 'Assistant.publishedVersionId')
    .innerJoin('Backend', 'Backend.id', 'AssistantVersion.backendId')
    .select([
      'AssistantVersion.id as versionId',
      'AssistantVersion.model as model',
      'AssistantVersion.systemPrompt as systemPrompt',
      'AssistantVersion.temperature as temperature',
      'AssistantVersion.tokenLimit as tokenLimit',
      'AssistantVersion.reasoning_effort as reasoningEffort',
      'Backend.providerType as providerType',
    ])
    .where('Assistant.id', '=', audit.assistantId)
    .executeTakeFirstOrThrow()

  const productionResponseRow = conversationMessages
    .filter((message) => message.parent === audit.messageId && message.role === 'assistant')
    .sort((a, b) => a.sentAt.localeCompare(b.sentAt))[0]
  const productionReply = productionResponseRow
    ? renderMessagePlainText(dtoMessageFromDbMessage(productionResponseRow))
    : ''

  cases.push({
    id: audit.messageId,
    source: {
      conversationId: audit.conversationId,
      messageId: audit.messageId,
      auditedInputTokens: audit.tokens,
      auditedModel: audit.model,
      sentAt: audit.sentAt,
    },
    assistant: {
      id: audit.assistantId,
      versionId: assistant.versionId,
      providerType: assistant.providerType as ProviderType,
      model: assistant.model,
      systemPrompt: assistant.systemPrompt,
      temperature: assistant.temperature,
      tokenLimit: assistant.tokenLimit,
      reasoningEffort: assistant.reasoningEffort,
    },
    messages,
    productionReply,
  })
}

if (cases.length === 0) {
  console.error('Bundle contains no replayable turns. Inspect its .skipped.json before retrying.')
  await db.destroy()
  rmSync(workdir, { recursive: true, force: true })
  process.exit(1)
}

const providerType = flag('provider') ?? cases[0]!.assistant.providerType
const modelOverride = flag('model')
const judgeModelOverride = flag('judge-model')
const apiKeyByProvider: Record<string, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  'google-ai-studio': process.env.GEMINI_API_KEY,
}
// The mock provider (ALLOW_MOCK_PROVIDER) is keyless and only used to smoke-test this pipeline.
const apiKey = providerType === 'mock' ? 'mock' : apiKeyByProvider[providerType]
if (!apiKey) {
  console.error(`Missing API key for provider "${providerType}".`)
  await db.destroy()
  rmSync(workdir, { recursive: true, force: true })
  process.exit(1)
}

const providerConfig = {
  providerType,
  name: 'production-replay',
  apiKey,
  provisioned: false,
} as Parameters<typeof ChatAssistant.build>[0]

const resolveModel = (id: string) => {
  const model = llmModels.find((entry) => entry.id === id && entry.provider === providerType)
  if (!model) throw new Error(`Model "${id}" is not defined for provider "${providerType}"`)
  return model
}

interface ReplayTurn {
  text: string
  usage: TurnUsage
  costUsd?: number
  error?: string
}
interface ReplayResult {
  caseId: string
  source: ProductionReplayCase['source']
  configuration: {
    provider: string
    model: string
    preset: string
    keepRecentTurns: number
    triggerAtTokens: number
    retrievalMode: string
  }
  estimatedHistoryTokens: { before: number; after: number; compressionTriggered: boolean }
  baseline: ReplayTurn
  compressed: ReplayTurn
  savings: { inputTokens: number; costUsd?: number }
  judgment?: ReplayJudgment
}

const cloneMessages = (messages: dto.Message[]) =>
  JSON.parse(JSON.stringify(messages)) as dto.Message[]

const runTurn = async (
  entry: ProductionReplayCase,
  modelId: string,
  compression: dto.ContextCompressionConfig
): Promise<ReplayTurn> => {
  const model = resolveModel(modelId)
  const assistant = await ChatAssistant.build(
    providerConfig,
    {
      assistantId: `production-replay-${entry.id}`,
      model: model.id,
      systemPrompt: entry.assistant.systemPrompt,
      temperature: entry.assistant.temperature,
      tokenLimit: entry.assistant.tokenLimit,
      reasoning_effort: entry.assistant.reasoningEffort,
      contextCompression: compression,
    },
    {},
    [],
    [],
    { user: 'production-replay-user', conversationId: `production-replay-${entry.id}` }
  )
  const sink = new EvalSink()
  try {
    await assistant.processUserMessageWithSink(cloneMessages(entry.messages), sink)
    const usage = sink.getUsage()
    const text = sink.getText().trim() || `[no reply] ${sink.getErrors().join('; ')}`.trim()
    return {
      text,
      usage,
      costUsd: computeCostUsd(
        model.id,
        usage.inputTokens,
        usage.outputTokens,
        usage.inputTokenDetails
      ),
    }
  } catch (error) {
    return {
      text: '',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

const results: ReplayResult[] = []
try {
  for (const entry of cases) {
    if (entry.assistant.providerType !== providerType && !flag('provider')) {
      throw new Error(
        `Bundle contains multiple providers; rerun with --provider and --model for case ${entry.id}`
      )
    }
    const caseModel = resolveModel(modelOverride ?? entry.assistant.model)
    const compression: dto.ContextCompressionConfig = {
      preset: preset as 'conservative' | 'aggressive',
      triggerAtTokens,
      keepRecentTurns,
      retrievalMode: retrievalMode as 'prefetch' | 'tool',
    }
    const costsBefore = await estimateHistoryMessageCosts(caseModel, entry.messages)
    const before = costsBefore.reduce((total, cost) => total + cost.tokens, 0)
    const decisions =
      before >= triggerAtTokens
        ? planMessageCompression(entry.messages, compression.preset, { keepRecentTurns })
        : []
    const planned =
      decisions.length > 0
        ? await applyCompressionPlan(cloneMessages(entry.messages), decisions, {
            prefetchQuery:
              retrievalMode === 'prefetch'
                ? (entry.messages.at(-1) as dto.UserMessage).content
                : undefined,
          })
        : entry.messages
    const costsAfter = await estimateHistoryMessageCosts(caseModel, planned)
    const after = costsAfter.reduce((total, cost) => total + cost.tokens, 0)

    process.stderr.write(`Replaying ${entry.id}: ${before} estimated history tokens\n`)
    const baseline = await runTurn(entry, caseModel.id, null)
    const compressed = await runTurn(entry, caseModel.id, compression)
    const judgment =
      !bool('no-judge') && !compressed.error
        ? await createReplayJudge(
            ChatAssistant.createLanguageModel(
              providerConfig,
              resolveModel(judgeModelOverride ?? caseModel.id)
            )
          )(
            (entry.messages.at(-1) as dto.UserMessage).content,
            entry.productionReply,
            compressed.text
          )
        : undefined
    results.push({
      caseId: entry.id,
      source: entry.source,
      configuration: {
        provider: providerType,
        model: caseModel.id,
        preset,
        keepRecentTurns,
        triggerAtTokens,
        retrievalMode,
      },
      estimatedHistoryTokens: { before, after, compressionTriggered: before >= triggerAtTokens },
      baseline,
      compressed,
      savings: {
        inputTokens: baseline.usage.inputTokens - compressed.usage.inputTokens,
        costUsd:
          baseline.costUsd !== undefined && compressed.costUsd !== undefined
            ? baseline.costUsd - compressed.costUsd
            : undefined,
      },
      judgment,
    })
  }
} finally {
  await db.destroy()
  rmSync(workdir, { recursive: true, force: true })
}

const totalInputSavings = results.reduce((total, result) => total + result.savings.inputTokens, 0)
const totalCostSavings = results.reduce((total, result) => total + (result.savings.costUsd ?? 0), 0)
const allCostsKnown = results.every((result) => result.savings.costUsd !== undefined)
const verdicts = new Map<string, number>()
for (const result of results) {
  if (!result.judgment) continue
  verdicts.set(result.judgment.verdict, (verdicts.get(result.judgment.verdict) ?? 0) + 1)
}
const markdown = [
  '# Production chat compression replay',
  '',
  `Replayed ${results.length} production turn(s) from \`${path.basename(bundlePath)}\` using ` +
    `\`${providerType}/${modelOverride ?? 'each turn’s saved assistant model'}\`. No source ` +
    'deployment was contacted.',
  '',
  '| message | production input | history estimate before→after | baseline in | compressed in | input saved | cost saved | verdict |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ...results.map(
    (result) =>
      `| ${result.caseId} | ${result.source.auditedInputTokens} | ${
        result.estimatedHistoryTokens.before
      }→${result.estimatedHistoryTokens.after} | ${result.baseline.usage.inputTokens} | ${
        result.compressed.usage.inputTokens
      } | ${result.savings.inputTokens} | ${formatCostUsd(result.savings.costUsd)} | ${
        result.judgment?.verdict ?? 'not judged'
      } |`
  ),
  '',
  `Total replay input-token saving: **${totalInputSavings}**. Total priced saving: **${
    allCostsKnown
      ? formatCostUsd(totalCostSavings)
      : 'n/a (one or more replay models have no configured price)'
  }**.`,
  '',
  '## Failure review',
  '',
  ...results.flatMap((result) =>
    result.judgment && result.judgment.verdict !== 'equivalent'
      ? [
          `- ${result.caseId} — ${result.judgment.verdict}: ${result.judgment.rationale}${
            result.judgment.failures.length ? ` (${result.judgment.failures.join('; ')})` : ''
          }`,
        ]
      : []
  ),
  ...(results.some((result) => result.judgment && result.judgment.verdict !== 'equivalent')
    ? []
    : [
        '- No judged regressions. Review individual transcript JSON before treating this as a correctness guarantee.',
      ]),
  '',
].join('\n')

await writeFile(
  out,
  JSON.stringify(
    { version: 1, createdAt: new Date().toISOString(), bundle: bundlePath, results },
    null,
    2
  ),
  'utf-8'
)
await writeFile(reportPath, markdown, 'utf-8')
console.error(
  `Wrote ${out} and ${reportPath}. Verdicts: ${
    [...verdicts.entries()].map(([key, value]) => `${key}=${value}`).join(', ') || 'not judged'
  }`
)
