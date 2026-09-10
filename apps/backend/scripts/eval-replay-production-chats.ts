/**
 * Replays one production turn through the current code, loading the conversation either from an
 * offline bundle or directly from the configured live database/storage.
 *
 * `--message <messageId>` selects the audited user message. Without it, the runner selects the
 * latest audited user message with a saved assistant response. It reconstructs that message's
 * parent lineage from the complete saved conversation.
 *
 * For each turn the runner rebuilds the saved assistant, applies `--override` on top of its
 * configuration, and records the response plus real provider token usage and priced cost. It can
 * compare knowledge arms directly; for other changes, the "before" number is production's own
 * `MessageAudit` input-token count, already in the bundle. To evaluate a compression preset,
 * different model, or new build, run it with the corresponding `--override` — or from a checkout /
 * deployment that has the change — and read the delta against production.
 *
 * In bundle mode, the runner copies the SQLite bundle to a scratch dir and serves attachment bytes
 * from `ReplayFileBlob`. In live mode it reads the already-configured database and storage. The
 * ChatAssistant receives no persistence callbacks, so live replay does not write messages; normal
 * compression/file-analysis cache writes can still occur, so use bundle mode when zero source-DB
 * mutation is required.
 *
 * Usage:
 *   OPENAI_API_KEY=... npx tsx apps/backend/scripts/eval-replay-production-chats.ts \
 *     --bundle bundle.sqlite --out replay-results.json --report replay-report.md \
 *     --override '{"contextCompression":{"preset":"conservative"}}'
 *
 *   DATABASE_URL=... FILE_STORAGE_LOCATION=... OPENAI_API_KEY=... \
 *   npx tsx apps/backend/scripts/eval-replay-production-chats.ts \
 *     --conversation <conversation-id> --message <message-id> \
 *     --out replay-results.json --report replay-report.md
 *
 * Flags:
 *   --bundle <path>        offline bundle from eval-build-replay-bundle.ts
 *   --conversation <id>    live conversation (mutually exclusive with --bundle)
 *   --message <id>         audited user message (default: latest with saved assistant response)
 *   --out <path>           JSON results, including response text (required)
 *   --report <path>        human-readable Markdown report (required)
 *   --override <json>      JSON object merged over each turn's saved assistant config
 *                          (model, systemPrompt, temperature, tokenLimit, reasoning_effort,
 *                          contextCompression). Use '{"contextCompression":null}' to disable it.
 *   --provider <type>      provider for the replay (default: the bundle's) — needs its API key
 *   --model <id>           shorthand for --override '{"model":"<id>"}' (Mode B: a cheap model for
 *                          an off/on pair — see docs/evaluation-harness.md; ids in
 *                          REPLAY_EXTRA_MODELS below are dev-only and not user-visible)
 *   --knowledge-arms <...> comma-separated assistant-knowledge, knowledge-box, and/or
 *                          knowledge-box-no-projections (default: assistant-knowledge)
 *   --repeat <n>           replay each knowledge arm n times; box ingestion happens once (default: 1)
 *   --inspect-only         calculate compression decisions/token estimates without an LLM call
 *   --judge                also classify each response against the saved production reply
 *   --judge-model <id>     judge model (default: the replay model)
 */

import { copyFileSync, mkdtempSync, rmSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type * as dto from '@/types/dto'
import type { Message as DbMessage } from '@/db/schema'
import type { ProviderType } from '@/types/provider'
import { computeCostUsd, formatCostUsd } from '@/backend/lib/eval/cost'
import type {
  KnowledgeReplayArmName,
  ProductionReplayCase,
  ReplayJudgment,
} from '@/backend/lib/eval/productionChatReplay'
import type { SetupCost } from '@/backend/lib/eval/types'

const args = process.argv.slice(2).filter((arg) => arg !== '--')
const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}
const bool = (name: string) => args.includes(`--${name}`)
const bundlePath = flag('bundle')
const liveConversationId = flag('conversation')
const out = flag('out')
const reportPath = flag('report')
const repeat = Number(flag('repeat') ?? 1)
if (
  (!bundlePath && !liveConversationId) ||
  (bundlePath && liveConversationId) ||
  !out ||
  !reportPath
) {
  console.error(
    'Usage: (--bundle <bundle.sqlite> | --conversation <id>) [--message <id>] ' +
      '--out <results.json> --report <report.md>'
  )
  process.exit(1)
}
if (!Number.isInteger(repeat) || repeat < 1) {
  console.error('--repeat must be a positive integer')
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
const workdir = bundlePath
  ? mkdtempSync(path.join(tmpdir(), 'logicle-production-replay-'))
  : undefined
if (bundlePath && workdir) {
  const replayDbPath = path.join(workdir, 'replay.sqlite')
  copyFileSync(bundlePath, replayDbPath)
  process.env.DATABASE_URL = `file://${replayDbPath}`
  process.env.FILE_STORAGE_LOCATION = 'replaydb:'
}

const { db } = await import('@/db/database')
const { dtoMessageFromDbMessage } = await import('@/models/utils')
const { assistantVersionFiles } = await import('@/models/assistant')
const { renderMessagePlainText } = await import('@/backend/lib/chat/message-projection')
const { ChatAssistant } = await import('@/backend/lib/chat')
const { EvalSink } = await import('@/backend/lib/eval/sink')
const { setTokenizerCounter } = await import('@/backend/lib/chat/prompt-token-counter')
const { countTextWithTokenizer } = await import('@/lib/chat/tokenizer')
const { llmModels } = await import('@/lib/models')
const { modelSupportsReasoning } = await import('@/lib/chat/models')
const { estimateHistoryMessageCosts } = await import('@/backend/lib/chat/token-estimator')
const {
  applyCompressionPlan,
  planMessageCompression,
  resolveCompressionUserQuery,
  resolveCompressionRetrievalMode,
  resolveCompressionTriggerTokens,
} = await import('@/backend/lib/chat/compression-planner')
const {
  createReplayJudge,
  defaultReplayKnowledgeQuestions,
  isReplayableLineage,
  parseKnowledgeReplayArms,
} = await import('@/backend/lib/eval/productionChatReplay')
const { allInContextArm, createKnowledgeBoxArm } = await import('@/backend/lib/eval/arms')
type LlmModel = (typeof llmModels)[number]

setTokenizerCounter({
  countText: async (tokenizer, text) => countTextWithTokenizer(tokenizer, text),
})

// Cheap models for local off/on replay (Mode B in docs/evaluation-harness.md) that are not in the
// shipped catalog. Dev-only — this list never reaches users. Add a matching price to
// apps/backend/lib/eval/cost.ts or the cost column stays blank.
const REPLAY_EXTRA_MODELS: LlmModel[] = [
  {
    id: 'gpt-5.6-luna',
    model: 'gpt-5.6-luna',
    name: 'GPT-5.6 Luna',
    description: 'Cheap GPT-5.6 tier — replay eval only, not user-visible.',
    provider: 'openai',
    owned_by: 'openai',
    context_length: 400000,
    capabilities: { vision: true, function_calling: true, promptCaching: false },
    supportedReasoningEfforts: ['none', 'low', 'medium', 'high'],
    defaultReasoning: 'low',
  },
]
const modelCatalog: LlmModel[] = [...llmModels, ...REPLAY_EXTRA_MODELS]

const abortReplay = async (message: string): Promise<never> => {
  console.error(message)
  await db.destroy()
  if (workdir) rmSync(workdir, { recursive: true, force: true })
  process.exit(1)
}

// --- choose one conversation, then one audited user message ---
let conversationId = liveConversationId
if (bundlePath) {
  const bundledConversations = await db.selectFrom('Conversation').selectAll().limit(2).execute()
  if (bundledConversations.length !== 1) {
    await abortReplay(
      `Bundle must contain exactly one conversation; found ${bundledConversations.length}.`
    )
  }
  conversationId = bundledConversations[0]!.id
}
if (!conversationId) await abortReplay('No conversation was selected.')
const replayConversationId = conversationId as string

const conversationRecord = await db
  .selectFrom('Conversation')
  .selectAll()
  .where('id', '=', replayConversationId)
  .executeTakeFirst()
if (!conversationRecord) await abortReplay(`Conversation ${replayConversationId} does not exist.`)
const conversation = conversationRecord!

const conversationMessages = await db
  .selectFrom('Message')
  .selectAll()
  .where('conversationId', '=', replayConversationId)
  .execute()
const byId = new Map(conversationMessages.map((message) => [message.id, message]))
const userAudits = await db
  .selectFrom('MessageAudit')
  .selectAll()
  .where('type', '=', 'user')
  .where('conversationId', '=', replayConversationId)
  .orderBy('sentAt', 'desc')
  .execute()
const requestedMessageId = flag('message')
const hasSavedAssistantResponse = (messageId: string) =>
  conversationMessages.some(
    (message) => message.parent === messageId && message.role === 'assistant'
  )
const audit = requestedMessageId
  ? userAudits.find((entry) => entry.messageId === requestedMessageId)
  : userAudits.find((entry) => hasSavedAssistantResponse(entry.messageId))
if (!audit) {
  await abortReplay(
    requestedMessageId
      ? `Message ${requestedMessageId} has no user MessageAudit in conversation ${replayConversationId}.`
      : `Conversation ${replayConversationId} has no audited user message with a saved assistant response.`
  )
}
const selectedAudit = audit!
const targetMessage = byId.get(selectedAudit.messageId)
if (!targetMessage || (targetMessage.role !== 'user' && targetMessage.role !== 'user-response')) {
  await abortReplay(`Audited message ${selectedAudit.messageId} is not a saved user message.`)
}
if (!hasSavedAssistantResponse(selectedAudit.messageId)) {
  await abortReplay(`Message ${selectedAudit.messageId} has no saved assistant response.`)
}
if (selectedAudit.errors !== null) {
  await abortReplay(
    `Message ${selectedAudit.messageId} errored in production: ${selectedAudit.errors}`
  )
}

// Parent-lineage reconstruction belongs here, not in the bundle builder. The same code therefore
// runs against a complete offline conversation and a live one.
const lineageRows: DbMessage[] = []
let cursor: DbMessage | undefined = targetMessage
while (cursor) {
  lineageRows.push(cursor)
  if (!cursor.parent) break
  const parentId: string = cursor.parent
  cursor = byId.get(parentId)
  if (!cursor)
    await abortReplay(`Message ${lineageRows.at(-1)!.id} has missing parent ${parentId}.`)
}
lineageRows.reverse()
let messages: dto.Message[]
try {
  messages = lineageRows.map(dtoMessageFromDbMessage)
} catch (error) {
  await abortReplay(
    `Lineage for message ${selectedAudit.messageId} cannot be converted: ${
      error instanceof Error ? error.message : error
    }`
  )
}
const replayMessages = messages!
const lineageReason = isReplayableLineage(replayMessages)
if (lineageReason)
  await abortReplay(`Message ${selectedAudit.messageId} is not replayable: ${lineageReason}.`)

const assistant = await db
  .selectFrom('Assistant')
  .innerJoin('AssistantVersion', 'AssistantVersion.id', 'Assistant.publishedVersionId')
  .innerJoin('Backend', 'Backend.id', 'AssistantVersion.backendId')
  .select([
    'Assistant.deleted as deleted',
    'AssistantVersion.id as versionId',
    'AssistantVersion.backendId as backendId',
    'AssistantVersion.model as model',
    'AssistantVersion.systemPrompt as systemPrompt',
    'AssistantVersion.temperature as temperature',
    'AssistantVersion.tokenLimit as tokenLimit',
    'AssistantVersion.reasoning_effort as reasoningEffort',
    'AssistantVersion.contextCompression as contextCompression',
    'AssistantVersion.subAssistants as subAssistants',
    'Backend.providerType as providerType',
    'Backend.configuration as backendConfiguration',
  ])
  .where('Assistant.id', '=', selectedAudit.assistantId)
  .executeTakeFirst()
if (!assistant)
  await abortReplay(`Assistant ${selectedAudit.assistantId} or its version is unavailable.`)
const selectedAssistant = assistant!
if (selectedAssistant.deleted !== 0)
  await abortReplay(`Assistant ${selectedAudit.assistantId} is deleted.`)
if (selectedAssistant.model !== selectedAudit.model) {
  await abortReplay(
    `Model drift for message ${selectedAudit.messageId}: production used ${selectedAudit.model}, ` +
      `current saved assistant uses ${selectedAssistant.model}.`
  )
}
const subAssistants = selectedAssistant.subAssistants
  ? (JSON.parse(String(selectedAssistant.subAssistants)) as unknown[])
  : []
if (Array.isArray(subAssistants) && subAssistants.length > 0) {
  await abortReplay(
    `Assistant ${selectedAudit.assistantId} has sub-assistants; replay has no fixture.`
  )
}
const configuredTool = await db
  .selectFrom('AssistantVersionToolAssociation')
  .select('toolId')
  .where('assistantVersionId', '=', selectedAssistant.versionId)
  .executeTakeFirst()
if (configuredTool) {
  await abortReplay(
    `Assistant ${selectedAudit.assistantId} has configured tools; replay has no fixture.`
  )
}
const knowledgeFiles = await assistantVersionFiles(selectedAssistant.versionId)

const productionResponseRow = conversationMessages
  .filter((message) => message.parent === selectedAudit.messageId && message.role === 'assistant')
  .sort((a, b) => a.sentAt.localeCompare(b.sentAt))[0]!
const productionReply = renderMessagePlainText(dtoMessageFromDbMessage(productionResponseRow))
const cases: ProductionReplayCase[] = [
  {
    id: selectedAudit.messageId,
    source: {
      conversationId: selectedAudit.conversationId,
      messageId: selectedAudit.messageId,
      auditedInputTokens: selectedAudit.tokens,
      auditedModel: selectedAudit.model,
      sentAt: selectedAudit.sentAt,
    },
    assistant: {
      id: selectedAudit.assistantId,
      versionId: selectedAssistant.versionId,
      providerType: selectedAssistant.providerType as ProviderType,
      model: selectedAssistant.model,
      systemPrompt: selectedAssistant.systemPrompt,
      temperature: selectedAssistant.temperature,
      tokenLimit: selectedAssistant.tokenLimit,
      reasoningEffort: selectedAssistant.reasoningEffort,
      contextCompression: selectedAssistant.contextCompression
        ? (JSON.parse(selectedAssistant.contextCompression) as Record<string, unknown>)
        : null,
      backendEndpoint: selectedAssistant.backendConfiguration
        ? (JSON.parse(selectedAssistant.backendConfiguration) as { endPoint?: string }).endPoint ??
          undefined
        : undefined,
    },
    messages: replayMessages,
    knowledgeFiles,
    productionReply,
  },
]
const replayUser = bundlePath ? 'production-replay-user' : conversation.ownerId

const knowledgeArmNames: KnowledgeReplayArmName[] = await (async () => {
  try {
    return parseKnowledgeReplayArms(flag('knowledge-arms'), cases[0]!.knowledgeFiles.length > 0)
  } catch (error) {
    return abortReplay(error instanceof Error ? error.message : String(error))
  }
})()
if (
  !bundlePath &&
  knowledgeArmNames.some(
    (name) => name === 'knowledge-box' || name === 'knowledge-box-no-projections'
  )
) {
  await abortReplay(
    'Knowledge-box arms require --bundle because indexing writes evaluation rows. Build an offline bundle first.'
  )
}

const providerType = flag('provider') ?? cases[0]!.assistant.providerType
const resolveModel = (id: string) => {
  // Prefer the definition the replay provider actually lists; otherwise fall back to the model of
  // that id from any provider. The replay deliberately points the provider config at one backend
  // (e.g. a logiclecloud proxy that also serves Gemini for a cheap run), and the registry's
  // `provider` field only gates the tokenizer/capabilities metadata, not API routing.
  const model =
    modelCatalog.find((entry) => entry.id === id && entry.provider === providerType) ??
    modelCatalog.find((entry) => entry.id === id)
  if (!model) throw new Error(`Model "${id}" is not defined in this checkout`)
  return model
}

const inspectedAssistantConfig: Record<string, unknown> = {
  assistantId: `production-replay-${selectedAudit.messageId}`,
  model: cases[0]!.assistant.model,
  systemPrompt: cases[0]!.assistant.systemPrompt,
  temperature: cases[0]!.assistant.temperature,
  tokenLimit: cases[0]!.assistant.tokenLimit,
  reasoning_effort: cases[0]!.assistant.reasoningEffort,
  contextCompression: cases[0]!.assistant.contextCompression,
  ...override,
}
const inspectedModel = resolveModel(String(inspectedAssistantConfig.model))
const historyCostsBefore = await estimateHistoryMessageCosts(inspectedModel, replayMessages)
const estimatedHistoryTokensBefore = historyCostsBefore.reduce(
  (total, entry) => total + entry.tokens,
  0
)
const compression = inspectedAssistantConfig.contextCompression as dto.ContextCompressionConfig
const triggerAtTokens = compression
  ? resolveCompressionTriggerTokens(compression.triggerAtTokens)
  : undefined
const triggered = !!compression && estimatedHistoryTokensBefore >= triggerAtTokens!
const decisions = triggered
  ? planMessageCompression(replayMessages, compression.preset, {
      keepRecentTurns: compression.keepRecentTurns,
    })
  : []
const finalUserMessage = [...replayMessages]
  .reverse()
  .find((message): message is dto.UserMessage => message.role === 'user')
const userQuery = compression ? resolveCompressionUserQuery(replayMessages) : undefined
const plannedMessages = triggered
  ? await applyCompressionPlan(replayMessages, decisions, {
      prefetchQuery:
        resolveCompressionRetrievalMode(compression.retrievalMode) === 'prefetch'
          ? userQuery
          : undefined,
      attachmentContinuationQuery: userQuery,
    })
  : replayMessages
const historyCostsAfter = await estimateHistoryMessageCosts(inspectedModel, plannedMessages)
const estimatedHistoryTokensAfter = historyCostsAfter.reduce(
  (total, entry) => total + entry.tokens,
  0
)
const tokenLimit = Number(inspectedAssistantConfig.tokenLimit)
const inspection = {
  model: inspectedModel.id,
  tokenLimit,
  productionInputTokens: selectedAudit.tokens,
  productionInputExceedsTokenLimit: selectedAudit.tokens > tokenLimit,
  compressionEnabled: !!compression,
  triggerAtTokens,
  triggered,
  preset: compression?.preset,
  retrievalMode: compression
    ? resolveCompressionRetrievalMode(compression.retrievalMode)
    : undefined,
  prefetchQuerySource:
    compression && resolveCompressionRetrievalMode(compression.retrievalMode) === 'prefetch'
      ? finalUserMessage?.content.trim()
        ? 'current-user'
        : userQuery
        ? 'previous-user-fallback'
        : 'none'
      : undefined,
  estimatedHistoryTokensBefore,
  estimatedHistoryTokensAfter,
  estimatedHistoryTokenReduction: estimatedHistoryTokensBefore - estimatedHistoryTokensAfter,
  estimatedHistoryReductionRatio:
    estimatedHistoryTokensBefore > 0
      ? (estimatedHistoryTokensBefore - estimatedHistoryTokensAfter) / estimatedHistoryTokensBefore
      : 0,
  historyAloneExceedsTokenLimitBefore: estimatedHistoryTokensBefore > tokenLimit,
  historyAloneExceedsTokenLimitAfter: estimatedHistoryTokensAfter > tokenLimit,
  summarizedMessages: decisions
    .filter((decision) => decision.policy === 'summary')
    .map((decision) => ({
      messageId: decision.messageId,
      reason: decision.reason,
      estimatedTokensBefore: decision.estimatedTokensBefore,
      estimatedTokensAfter: decision.estimatedTokensAfter,
    })),
  selectedMessageDecision:
    decisions.find((decision) => decision.messageId === selectedAudit.messageId) ?? null,
}

if (bool('inspect-only')) {
  const inspectionMarkdown = [
    '# Production chat replay inspection',
    '',
    `Conversation: \`${replayConversationId}\``,
    `Selected message: \`${selectedAudit.messageId}\``,
    `Model: \`${inspection.model}\``,
    `Saved token limit: **${tokenLimit}**`,
    `Production input tokens: **${selectedAudit.tokens}**`,
    `Assistant knowledge files: **${cases[0]!.knowledgeFiles.length}**.`,
    '',
    `Compression: **${inspection.compressionEnabled ? 'enabled' : 'disabled'}**` +
      (compression
        ? `; preset \`${compression.preset}\`; retrieval \`${inspection.retrievalMode}\`; ` +
          `trigger ${triggerAtTokens}; triggered: **${triggered}**`
        : ''),
    `Estimated history tokens: **${estimatedHistoryTokensBefore} → ${estimatedHistoryTokensAfter}** ` +
      `(${(inspection.estimatedHistoryReductionRatio * 100).toFixed(1)}% reduction).`,
    `Summarized messages: **${inspection.summarizedMessages.length}**.`,
    `Selected/current message policy: **${
      inspection.selectedMessageDecision?.policy ?? 'not planned'
    }**` +
      (inspection.selectedMessageDecision
        ? ` (${inspection.selectedMessageDecision.reason}).`
        : '.'),
    '',
    ...(inspection.summarizedMessages.length > 0
      ? [
          '| message | reason | rough policy tokens before | after |',
          '| --- | --- | ---: | ---: |',
          ...inspection.summarizedMessages.map(
            (entry) =>
              `| ${entry.messageId} | ${entry.reason} | ${entry.estimatedTokensBefore} | ${entry.estimatedTokensAfter} |`
          ),
          '',
        ]
      : []),
    '_Inspection only: no LLM call was made._',
  ].join('\n')
  await writeFile(
    out,
    JSON.stringify(
      {
        version: 4,
        createdAt: new Date().toISOString(),
        source: bundlePath
          ? { mode: 'bundle', bundle: bundlePath }
          : { mode: 'live', conversationId: replayConversationId },
        selectedMessageId: selectedAudit.messageId,
        override,
        knowledgeArms: knowledgeArmNames,
        knowledgeFiles: cases[0]!.knowledgeFiles,
        inspection,
      },
      null,
      2
    ),
    'utf-8'
  )
  await writeFile(reportPath, inspectionMarkdown, 'utf-8')
  await db.destroy()
  if (workdir) rmSync(workdir, { recursive: true, force: true })
  console.error(`Wrote ${out} and ${reportPath}. No LLM call was made.`)
  process.exit(0)
}

const apiKeyByProvider: Record<string, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  'google-ai-studio': process.env.GEMINI_API_KEY,
  logiclecloud: process.env.LOGICLECLOUD_API_KEY,
}
// The mock provider (ALLOW_MOCK_PROVIDER) is keyless and only used to smoke-test this pipeline.
const apiKey = providerType === 'mock' ? 'mock' : apiKeyByProvider[providerType]
if (!apiKey) await abortReplay(`Missing API key for provider "${providerType}".`)

const backendEndpoint = flag('endpoint') ?? cases[0]!.assistant.backendEndpoint
const providerConfig = {
  providerType,
  name: 'production-replay',
  apiKey,
  provisioned: false,
  ...(backendEndpoint ? { endPoint: backendEndpoint } : {}),
} as Parameters<typeof ChatAssistant.build>[0]

// Projection ingestion resolves a backend from the database rather than from ChatAssistant's
// explicit replay config. In bundle mode this row is a scratch copy, so point it at the same
// provider credentials used for the replay and avoid depending on secrets from production.
if (knowledgeArmNames.includes('knowledge-box')) {
  await db
    .updateTable('Backend')
    .set({
      providerType: providerType as never,
      configuration: JSON.stringify({
        apiKey,
        ...(backendEndpoint ? { endPoint: backendEndpoint } : {}),
      }),
    })
    .where('id', '=', selectedAssistant.backendId)
    .execute()
}

interface ReplayResult {
  caseId: string
  knowledgeArm: KnowledgeReplayArmName
  repetition: number
  source: ProductionReplayCase['source']
  model: string
  assistantConfig: Record<string, unknown>
  response: string
  usage: { inputTokens: number; outputTokens: number }
  providerCalls: number
  toolCalls: string[]
  costUsd?: number
  productionInputCostUsd?: number
  inputTokensVsProduction: number
  error?: string
  judgment?: ReplayJudgment
}

interface KnowledgeArmSetupResult {
  knowledgeArm: KnowledgeReplayArmName
  setupCost?: SetupCost
  setupCostUsd?: number
  error?: string
}

const cloneMessages = (messages: dto.Message[]) =>
  JSON.parse(JSON.stringify(messages)) as dto.Message[]

const results: ReplayResult[] = []
const armSetups: KnowledgeArmSetupResult[] = []
const replayScenario = {
  id: `production-replay-${selectedAudit.messageId}`,
  description: 'A fixed production conversation replay.',
  corpus: [],
  goal: 'Answer the final real user message.',
  maxTurns: 1,
  rubric: 'Preserve the usefulness and factual content of the production response.',
}
const knowledgeArmRegistry = {
  'assistant-knowledge': allInContextArm,
  'knowledge-box': createKnowledgeBoxArm({ questions: defaultReplayKnowledgeQuestions }),
  'knowledge-box-no-projections': createKnowledgeBoxArm({ questions: [] }),
}
try {
  for (const entry of cases) {
    if (entry.assistant.providerType !== providerType && !flag('provider')) {
      throw new Error(
        `Bundle mixes providers; rerun with --provider and a matching --model for case ${entry.id}`
      )
    }
    for (const knowledgeArmName of knowledgeArmNames) {
      const arm = knowledgeArmRegistry[knowledgeArmName]
      let setup: Awaited<ReturnType<typeof arm.setup>> | undefined
      let setupError: string | undefined
      try {
        setup = await arm.setup({
          scenario: replayScenario,
          files: entry.knowledgeFiles,
          runId: `${entry.id}-${knowledgeArmName}`.replace(/[^a-zA-Z0-9-]/g, ''),
        })
      } catch (caught) {
        setupError = caught instanceof Error ? caught.message : String(caught)
      }

      armSetups.push({
        knowledgeArm: knowledgeArmName,
        setupCost: setup?.setupCost,
        setupCostUsd:
          setup?.setupCost?.calls === 0
            ? 0
            : setup?.setupCost?.modelId
            ? computeCostUsd(
                setup.setupCost.modelId,
                setup.setupCost.inputTokens,
                setup.setupCost.outputTokens
              )
            : undefined,
        error: setupError,
      })

      try {
        for (let repetition = 0; repetition < repeat; repetition += 1) {
          const assistantConfig: Record<string, unknown> = {
            assistantId: `production-replay-${entry.id}-${knowledgeArmName}-${repetition}`,
            model: entry.assistant.model,
            systemPrompt: entry.assistant.systemPrompt,
            temperature: entry.assistant.temperature,
            tokenLimit: entry.assistant.tokenLimit,
            reasoning_effort: entry.assistant.reasoningEffort,
            contextCompression: entry.assistant.contextCompression,
            ...override,
          }
          if (setup?.systemPromptSuffix) {
            assistantConfig.systemPrompt = `${String(assistantConfig.systemPrompt)}\n\n${
              setup.systemPromptSuffix
            }`
          }
          const model = resolveModel(String(assistantConfig.model))

          process.stderr.write(
            `Replaying ${entry.id} · ${knowledgeArmName} · #${repetition + 1} ` +
              `(production input ${entry.source.auditedInputTokens})\n`
          )
          const sink = new EvalSink()
          let response = ''
          let usage = { inputTokens: 0, outputTokens: 0 }
          let providerCalls = 0
          let toolCalls: string[] = []
          let error = setupError
          if (!error && setup) {
            try {
              const assistant = await ChatAssistant.build(
                providerConfig,
                assistantConfig as unknown as Parameters<typeof ChatAssistant.build>[1],
                {},
                setup.tools,
                setup.knowledge,
                { user: replayUser, conversationId: replayConversationId }
              )
              await assistant.processUserMessageWithSink(cloneMessages(entry.messages), sink)
              const raw = sink.getUsage()
              usage = { inputTokens: raw.inputTokens, outputTokens: raw.outputTokens }
              providerCalls = sink.events.filter((event) => event.type === 'usage').length
              toolCalls = sink.getToolCallNames()
              response = sink.getText().trim() || `[no reply] ${sink.getErrors().join('; ')}`.trim()
            } catch (caught) {
              error = caught instanceof Error ? caught.message : String(caught)
            }
          }

          let judgment: ReplayJudgment | undefined
          if (bool('judge') && !error) {
            const judgeModel = resolveModel(flag('judge-model') ?? model.id)
            judgment = await createReplayJudge(
              ChatAssistant.createLanguageModel(providerConfig, judgeModel),
              {
                supportsTemperature:
                  !modelSupportsReasoning(judgeModel) &&
                  judgeModel.capabilities.temperature !== false,
              }
            )((entry.messages.at(-1) as dto.UserMessage).content, entry.productionReply, response)
          }

          results.push({
            caseId: entry.id,
            knowledgeArm: knowledgeArmName,
            repetition,
            source: entry.source,
            model: model.id,
            assistantConfig: { contextCompression: assistantConfig.contextCompression },
            response,
            usage,
            providerCalls,
            toolCalls,
            // Deliberately omit provider cache details: comparisons price every input token at
            // the ordinary rate, so a warm/cold prompt cache cannot manufacture a saving.
            costUsd: error
              ? undefined
              : computeCostUsd(model.id, usage.inputTokens, usage.outputTokens),
            productionInputCostUsd: computeCostUsd(model.id, entry.source.auditedInputTokens, 0),
            inputTokensVsProduction: entry.source.auditedInputTokens - usage.inputTokens,
            error,
            judgment,
          })
        }
      } finally {
        await setup?.teardown?.().catch(() => undefined)
      }
    }
  }
} finally {
  await db.destroy()
  if (workdir) rmSync(workdir, { recursive: true, force: true })
}

const verdicts = new Map<string, number>()
for (const result of results) {
  if (result.judgment) {
    verdicts.set(result.judgment.verdict, (verdicts.get(result.judgment.verdict) ?? 0) + 1)
  }
}

const successfulResults = results.filter((result) => !result.error)
const mean = (values: number[]): number | undefined =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : undefined
const baselineResults = successfulResults.filter(
  (result) => result.knowledgeArm === 'assistant-knowledge'
)
const baselineMeanInput = mean(baselineResults.map((result) => result.usage.inputTokens))
const baselineMeanCost = mean(
  baselineResults.flatMap((result) => (result.costUsd === undefined ? [] : [result.costUsd]))
)
const armSummaries = knowledgeArmNames.map((knowledgeArm) => {
  const armResults = successfulResults.filter((result) => result.knowledgeArm === knowledgeArm)
  const meanInputTokens = mean(armResults.map((result) => result.usage.inputTokens))
  const meanOutputTokens = mean(armResults.map((result) => result.usage.outputTokens))
  const meanCostUsd = mean(
    armResults.flatMap((result) => (result.costUsd === undefined ? [] : [result.costUsd]))
  )
  const setup = armSetups.find((entry) => entry.knowledgeArm === knowledgeArm)
  const perRunSavingUsd =
    baselineMeanCost !== undefined && meanCostUsd !== undefined
      ? baselineMeanCost - meanCostUsd
      : undefined
  return {
    knowledgeArm,
    successfulRuns: armResults.length,
    failedRuns: results.filter((result) => result.knowledgeArm === knowledgeArm && result.error)
      .length,
    meanInputTokens,
    meanOutputTokens,
    meanCostUsd,
    inputTokensSavedVsAssistantKnowledge:
      baselineMeanInput !== undefined && meanInputTokens !== undefined
        ? baselineMeanInput - meanInputTokens
        : undefined,
    setupCost: setup?.setupCost,
    setupCostUsd: setup?.setupCostUsd,
    breakEvenConversations:
      setup?.setupCostUsd !== undefined && perRunSavingUsd !== undefined && perRunSavingUsd > 0
        ? setup.setupCostUsd / perRunSavingUsd
        : undefined,
  }
})

const formatMean = (value: number | undefined) =>
  value === undefined ? 'n/a' : Math.round(value).toLocaleString('en-US')
const formatSignedMean = (value: number | undefined) =>
  value === undefined
    ? 'n/a'
    : `${value >= 0 ? '+' : ''}${Math.round(value).toLocaleString('en-US')}`
const formatBreakEven = (value: number | undefined) =>
  value === undefined ? 'n/a' : Math.ceil(value).toLocaleString('en-US')

const markdown = [
  '# Production knowledge replay',
  '',
  `Replayed message \`${selectedAudit.messageId}\` from conversation \`${replayConversationId}\` ` +
    (bundlePath
      ? `using offline bundle \`${path.basename(bundlePath)}\`.`
      : 'using the configured live database and storage.') +
    ' Production input tokens are from `MessageAudit` (input only).',
  '',
  `Assistant knowledge corpus: **${cases[0]!.knowledgeFiles.length} file(s)**. ` +
    `Arms: ${knowledgeArmNames.map((name) => `\`${name}\``).join(', ')}. ` +
    `Repetitions: **${repeat}**.`,
  '',
  override && Object.keys(override).length > 0
    ? `Config override: \`${JSON.stringify(override)}\``
    : 'No config override — replayed with each turn’s saved assistant configuration.',
  '',
  `Deterministic history estimate: **${inspection.estimatedHistoryTokensBefore} → ` +
    `${inspection.estimatedHistoryTokensAfter}**; summarized messages: ` +
    `**${inspection.summarizedMessages.length}**.`,
  '',
  '## Arm summary',
  '',
  '| arm | successful / failed | mean input | mean output | input saved vs assistant knowledge | mean run cost | setup cost | break-even conversations |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...armSummaries.map(
    (summary) =>
      `| ${summary.knowledgeArm} | ${summary.successfulRuns} / ${summary.failedRuns} | ` +
      `${formatMean(summary.meanInputTokens)} | ${formatMean(summary.meanOutputTokens)} | ` +
      `${formatSignedMean(summary.inputTokensSavedVsAssistantKnowledge)} | ` +
      `${formatCostUsd(summary.meanCostUsd)} | ${formatCostUsd(summary.setupCostUsd)} | ` +
      `${formatBreakEven(summary.breakEvenConversations)} |`
  ),
  '',
  'Setup cost is paid once per knowledge corpus. Break-even uses total replay cost and is shown only when the `assistant-knowledge` baseline was run and the arm is cheaper.',
  '',
  '## Runs',
  '',
  '| arm | repetition | production input | replay input | replay output | provider calls | tool calls | replay cost | input Δ vs prod | verdict |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |',
  ...results.map(
    (r) =>
      `| ${r.knowledgeArm} | ${r.repetition + 1} | ${r.source.auditedInputTokens} | ${
        r.error ? 'error' : r.usage.inputTokens
      } | ${r.error ? '—' : r.usage.outputTokens} | ${r.error ? '—' : r.providerCalls} | ${
        r.error ? '—' : r.toolCalls.length
      } | ${formatCostUsd(r.costUsd)} | ${r.error ? '—' : r.inputTokensVsProduction} | ${
        r.error ? r.error : r.judgment?.verdict ?? 'not judged'
      } |`
  ),
  '',
  '_Judgments compare each replay with the saved production response, which is a reference rather than a factual answer key. Review regressions against the source documents._',
  '',
  ...(results.some((r) => r.judgment && r.judgment.verdict !== 'equivalent')
    ? [
        '## Response review',
        '',
        ...results.flatMap((r) =>
          r.judgment && r.judgment.verdict !== 'equivalent'
            ? [
                `- ${r.knowledgeArm} #${r.repetition + 1} — ${r.judgment.verdict}: ${
                  r.judgment.rationale
                }${r.judgment.failures.length ? ` (${r.judgment.failures.join('; ')})` : ''}`,
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
    {
      version: 4,
      createdAt: new Date().toISOString(),
      source: bundlePath
        ? { mode: 'bundle', bundle: bundlePath }
        : { mode: 'live', conversationId: replayConversationId },
      selectedMessageId: selectedAudit.messageId,
      override,
      repeat,
      knowledgeArms: knowledgeArmNames,
      knowledgeFiles: cases[0]!.knowledgeFiles,
      inspection,
      armSetups,
      armSummaries,
      results,
    },
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
