/**
 * Replays the production turns in an offline bundle through the current code.
 *
 * For each turn the runner rebuilds the saved assistant, applies `--override` on top of its
 * configuration, runs the turn once, and records the response plus the real provider token usage
 * and priced cost. It does not run an off/on comparison — the "before" number is production's own
 * `MessageAudit` input-token count, already in the bundle. To evaluate a change (a compression
 * preset, a different model, a new build) run it with the corresponding `--override` — or from a
 * checkout / deployment that has the change — and read the delta against production.
 *
 * Input is a bundle from `eval-build-replay-bundle.ts`. The runner copies it to a scratch dir,
 * points the app at that copy and at `FILE_STORAGE_LOCATION=replaydb:` (attachment bytes served
 * straight from the bundle), and never touches any source deployment, S3, or the network beyond
 * the LLM provider.
 *
 * Usage:
 *   OPENAI_API_KEY=... npx tsx apps/backend/scripts/eval-replay-production-chats.ts \
 *     --bundle bundle.sqlite --out replay-results.json --report replay-report.md \
 *     --override '{"contextCompression":{"preset":"conservative"}}'
 *
 * Flags:
 *   --bundle <path>        offline bundle from eval-build-replay-bundle.ts (required)
 *   --out <path>           JSON results, including response text (required)
 *   --report <path>        human-readable Markdown report (required)
 *   --override <json>      JSON object merged over each turn's saved assistant config
 *                          (model, systemPrompt, temperature, tokenLimit, reasoning_effort,
 *                          contextCompression). Use '{"contextCompression":null}' to disable it.
 *   --provider <type>      provider for the replay (default: the bundle's) — needs its API key
 *   --model <id>           shorthand for --override '{"model":"<id>"}'
 *   --judge                also classify each response against the saved production reply
 *   --judge-model <id>     judge model (default: the replay model)
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

let override: Record<string, unknown> = {}
const overrideRaw = flag('override')
if (overrideRaw) {
  try {
    override = JSON.parse(overrideRaw) as Record<string, unknown>
  } catch (error) {
    console.error(
      `--override must be valid JSON: ${error instanceof Error ? error.message : error}`
    )
    process.exit(1)
  }
}
const modelShorthand = flag('model')
if (modelShorthand) override.model = modelShorthand

// Work on a copy so a failed run never corrupts the bundle. Configure the app before imports.
const workdir = mkdtempSync(path.join(tmpdir(), 'logicle-production-replay-'))
const replayDbPath = path.join(workdir, 'replay.sqlite')
copyFileSync(bundlePath, replayDbPath)
process.env.DATABASE_URL = `file://${replayDbPath}`
process.env.FILE_STORAGE_LOCATION = 'replaydb:'

const { db } = await import('@/db/database')
const { dtoMessageFromDbMessage } = await import('@/models/utils')
const { renderMessagePlainText } = await import('@/backend/lib/chat/message-projection')
const { ChatAssistant } = await import('@/backend/lib/chat')
const { EvalSink } = await import('@/backend/lib/eval/sink')
const { setTokenizerCounter } = await import('@/backend/lib/chat/prompt-token-counter')
const { countTextWithTokenizer } = await import('@/lib/chat/tokenizer')
const { llmModels } = await import('@/lib/models')
const { createReplayJudge } = await import('@/backend/lib/eval/productionChatReplay')

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
      'AssistantVersion.contextCompression as contextCompression',
      'Backend.providerType as providerType',
      'Backend.configuration as backendConfiguration',
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
      contextCompression: assistant.contextCompression
        ? (JSON.parse(assistant.contextCompression) as Record<string, unknown>)
        : null,
      backendEndpoint: assistant.backendConfiguration
        ? (JSON.parse(assistant.backendConfiguration) as { endPoint?: string }).endPoint ??
          undefined
        : undefined,
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
const apiKeyByProvider: Record<string, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  'google-ai-studio': process.env.GEMINI_API_KEY,
  logiclecloud: process.env.LOGICLECLOUD_API_KEY,
}
// The mock provider (ALLOW_MOCK_PROVIDER) is keyless and only used to smoke-test this pipeline.
const apiKey = providerType === 'mock' ? 'mock' : apiKeyByProvider[providerType]
if (!apiKey) {
  console.error(`Missing API key for provider "${providerType}".`)
  await db.destroy()
  rmSync(workdir, { recursive: true, force: true })
  process.exit(1)
}

const backendEndpoint = flag('endpoint') ?? cases[0]!.assistant.backendEndpoint
const providerConfig = {
  providerType,
  name: 'production-replay',
  apiKey,
  provisioned: false,
  ...(backendEndpoint ? { endPoint: backendEndpoint } : {}),
} as Parameters<typeof ChatAssistant.build>[0]

const resolveModel = (id: string) => {
  const model = llmModels.find((entry) => entry.id === id && entry.provider === providerType)
  if (!model) throw new Error(`Model "${id}" is not defined for provider "${providerType}"`)
  return model
}

interface ReplayResult {
  caseId: string
  source: ProductionReplayCase['source']
  model: string
  assistantConfig: Record<string, unknown>
  response: string
  usage: { inputTokens: number; outputTokens: number }
  costUsd?: number
  productionInputCostUsd?: number
  inputTokensVsProduction: number
  error?: string
  judgment?: ReplayJudgment
}

const cloneMessages = (messages: dto.Message[]) =>
  JSON.parse(JSON.stringify(messages)) as dto.Message[]

const results: ReplayResult[] = []
try {
  for (const entry of cases) {
    if (entry.assistant.providerType !== providerType && !flag('provider')) {
      throw new Error(
        `Bundle mixes providers; rerun with --provider and a matching --model for case ${entry.id}`
      )
    }
    const assistantConfig: Record<string, unknown> = {
      assistantId: `production-replay-${entry.id}`,
      model: entry.assistant.model,
      systemPrompt: entry.assistant.systemPrompt,
      temperature: entry.assistant.temperature,
      tokenLimit: entry.assistant.tokenLimit,
      reasoning_effort: entry.assistant.reasoningEffort,
      contextCompression: entry.assistant.contextCompression,
      ...override,
    }
    const model = resolveModel(String(assistantConfig.model))

    process.stderr.write(
      `Replaying ${entry.id} (production input ${entry.source.auditedInputTokens})\n`
    )
    const sink = new EvalSink()
    let response = ''
    let usage = { inputTokens: 0, outputTokens: 0 }
    let error: string | undefined
    try {
      const assistant = await ChatAssistant.build(
        providerConfig,
        assistantConfig as unknown as Parameters<typeof ChatAssistant.build>[1],
        {},
        [],
        [],
        { user: 'production-replay-user', conversationId: `production-replay-${entry.id}` }
      )
      await assistant.processUserMessageWithSink(cloneMessages(entry.messages), sink)
      const raw = sink.getUsage()
      usage = { inputTokens: raw.inputTokens, outputTokens: raw.outputTokens }
      response = sink.getText().trim() || `[no reply] ${sink.getErrors().join('; ')}`.trim()
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught)
    }

    const judgment =
      bool('judge') && !error
        ? await createReplayJudge(
            ChatAssistant.createLanguageModel(
              providerConfig,
              resolveModel(flag('judge-model') ?? model.id)
            )
          )((entry.messages.at(-1) as dto.UserMessage).content, entry.productionReply, response)
        : undefined

    results.push({
      caseId: entry.id,
      source: entry.source,
      model: model.id,
      assistantConfig: { contextCompression: assistantConfig.contextCompression },
      response,
      usage,
      costUsd: computeCostUsd(model.id, usage.inputTokens, usage.outputTokens),
      productionInputCostUsd: computeCostUsd(model.id, entry.source.auditedInputTokens, 0),
      inputTokensVsProduction: entry.source.auditedInputTokens - usage.inputTokens,
      error,
      judgment,
    })
  }
} finally {
  await db.destroy()
  rmSync(workdir, { recursive: true, force: true })
}

const totalInputDelta = results.reduce((total, r) => total + r.inputTokensVsProduction, 0)
const verdicts = new Map<string, number>()
for (const result of results) {
  if (result.judgment) {
    verdicts.set(result.judgment.verdict, (verdicts.get(result.judgment.verdict) ?? 0) + 1)
  }
}

const markdown = [
  '# Production chat replay',
  '',
  `Replayed ${results.length} production turn(s) from \`${path.basename(
    bundlePath
  )}\` through the ` +
    'current code. No source deployment was contacted. Production input tokens are from the saved ' +
    '`MessageAudit` (input only).',
  '',
  override && Object.keys(override).length > 0
    ? `Config override: \`${JSON.stringify(override)}\``
    : 'No config override — replayed with each turn’s saved assistant configuration.',
  '',
  '| message | production input | replay input | replay output | replay cost | input Δ vs prod | verdict |',
  '| --- | ---: | ---: | ---: | ---: | ---: | --- |',
  ...results.map(
    (r) =>
      `| ${r.caseId} | ${r.source.auditedInputTokens} | ${
        r.error ? 'error' : r.usage.inputTokens
      } | ${r.error ? '—' : r.usage.outputTokens} | ${formatCostUsd(r.costUsd)} | ${
        r.error ? '—' : r.inputTokensVsProduction
      } | ${r.error ? r.error : r.judgment?.verdict ?? 'not judged'} |`
  ),
  '',
  `Total input-token delta vs production: **${totalInputDelta}** ` +
    `(positive = replay used fewer input tokens than production recorded).`,
  '',
  ...(results.some((r) => r.judgment && r.judgment.verdict !== 'equivalent')
    ? [
        '## Response review',
        '',
        ...results.flatMap((r) =>
          r.judgment && r.judgment.verdict !== 'equivalent'
            ? [
                `- ${r.caseId} — ${r.judgment.verdict}: ${r.judgment.rationale}${
                  r.judgment.failures.length ? ` (${r.judgment.failures.join('; ')})` : ''
                }`,
              ]
            : []
        ),
        '',
      ]
    : []),
].join('\n')

await writeFile(
  out,
  JSON.stringify(
    { version: 2, createdAt: new Date().toISOString(), bundle: bundlePath, override, results },
    null,
    2
  ),
  'utf-8'
)
await writeFile(reportPath, markdown, 'utf-8')
console.error(
  `Wrote ${out} and ${reportPath}.` +
    (verdicts.size
      ? ` Verdicts: ${[...verdicts.entries()].map(([k, v]) => `${k}=${v}`).join(', ')}`
      : '')
)
