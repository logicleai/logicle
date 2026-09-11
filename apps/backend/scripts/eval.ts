/**
 * Goal-driven evaluation runner.
 *
 * Replays a scenario against several assistant configurations ("arms") and reports what each one
 * achieved and what it cost. An LLM impersonates the user and pursues a goal; the assistant is the
 * real `ChatAssistant`, driven in-process against a throwaway SQLite database so ingestion,
 * retrieval, preamble construction and token accounting are the production code paths.
 *
 * Usage:
 *   OPENAI_API_KEY=... npx tsx apps/backend/scripts/eval.ts --repeat 5
 *   OPENAI_API_KEY=... npx tsx apps/backend/scripts/eval.ts \
 *     --scenario supplier-penalty --arms all-in-context,knowledge-box --repeat 8 --out report.md
 *
 * Flags:
 *   --scenario <id,...>   scenarios to run (default: all in the selected suite)
 *   --suite <name>        knowledge | context-compression (default: knowledge)
 *   --sweep <n,...>       replace the built-in scenarios with generated ones holding N documents
 *                         each, to trace cost and accuracy against corpus size
 *   --flip                with --sweep, generate each size twice — once with the answer in the
 *                         corpus and once with it removed — and report whether each arm declines
 *                         to answer only when the answer is genuinely absent
 *   --flip-withhold <how> clause (default: keep the document, drop the answer) | document
 *   --doc-words <n>       words per generated document (default: 700)
 *   --distractors <n>     generated documents stating the same clause with a different value (default: 4)
 *   --needle-depth <0..1> where the answer sits inside its document (default: 0.5)
 *   --seed <n>            generated-corpus seed (default: 1)
 *   --arms <name,...>     arms to compare (default: all-in-context,knowledge-box,knowledge-box-no-projections)
 *   --baseline <name>     arm every other arm is compared against (default: all-in-context)
 *   --repeat <n>          repetitions per (scenario, arm) (default: 3)
 *   --provider <type>     openai | anthropic | google-ai-studio (default: openai)
 *   --model <id>          assistant model id (default: gpt-4o-mini)
 *   --user-model <id>     model impersonating the user (default: same as --model)
 *   --judge-model <id>    model grading transcripts (default: same as --model)
 *   --no-judge            skip LLM grading, rely on the answer key alone
 *   --out <path>          write the markdown report here (default: stdout only)
 *   --runs-out <path>     write a versioned run artifact as JSON, for re-reporting without re-running
 *   --runs-in <path>      re-render a previous --runs-out artifact (or legacy raw run array); no API key needed
 *   --verbose             stream the conversation as it happens
 */

import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { readFile, writeFile } from 'node:fs/promises'
import type { Arm, EvaluationArtifact, RunResult } from '@/backend/lib/eval/types'

const args = process.argv.slice(2).filter((arg) => arg !== '--')

const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}
const bool = (name: string): boolean => args.includes(`--${name}`)
const list = (name: string): string[] | undefined =>
  flag(name)
    ?.split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)

const providerType = flag('provider') ?? 'openai'
const suite = flag('suite') ?? 'knowledge'
const assistantModel = flag('model') ?? 'gpt-4o-mini'
const userModelId = flag('user-model') ?? assistantModel
const judgeModelId = flag('judge-model') ?? assistantModel
const repeat = Number(flag('repeat') ?? 3)
const requestedBaselineArm = flag('baseline')
const baselineArm =
  requestedBaselineArm ?? (suite === 'context-compression' ? 'compression-off' : 'all-in-context')
const verbose = bool('verbose')
const useJudge = !bool('no-judge')
const runsIn = flag('runs-in')
const out = flag('out')
const requestedSweepSizes = list('sweep')
const sweepSizes = requestedSweepSizes?.map(Number)
if (
  requestedSweepSizes &&
  (sweepSizes!.length === 0 || sweepSizes!.some((size) => !Number.isFinite(size) || size <= 0))
) {
  console.error('--sweep expects one or more positive document counts')
  process.exit(1)
}
const requestedSeed = flag('seed')
const generatedSeed = Number(requestedSeed ?? 1)
if (!Number.isFinite(generatedSeed)) {
  console.error('--seed expects a finite number')
  process.exit(1)
}
if (requestedSeed && !sweepSizes) {
  console.error('--seed only applies with --sweep')
  process.exit(1)
}
const flipTest = bool('flip')
const requestedFlipWithhold = flag('flip-withhold')
if (
  requestedFlipWithhold &&
  requestedFlipWithhold !== 'clause' &&
  requestedFlipWithhold !== 'document'
) {
  console.error(`Unknown --flip-withhold value "${requestedFlipWithhold}". Known: clause, document`)
  process.exit(1)
}
if (requestedFlipWithhold && !flipTest) {
  console.error('--flip-withhold only applies when --flip is enabled')
  process.exit(1)
}
const flipWithhold = requestedFlipWithhold === 'document' ? 'document' : 'clause'

if (flipTest && !sweepSizes) {
  console.error('--flip needs --sweep <n,...>: the paired corpora are generated, not built in')
  process.exit(1)
}

if (runsIn) {
  const { readRunsArtifact } = await import('@/backend/lib/eval/artifact')
  const { renderMarkdown } = await import('@/backend/lib/eval/report')
  const artifact = readRunsArtifact(JSON.parse(await readFile(runsIn, 'utf-8')))
  const markdown = renderMarkdown(
    artifact.runs,
    requestedBaselineArm ?? artifact.metadata.baselineArm
  )
  process.stdout.write(`\n${markdown}\n`)
  if (out) {
    await writeFile(out, markdown, 'utf-8')
    console.info(`Report written to ${out}`)
  }
  process.exit(0)
}

const apiKeyByProvider: Record<string, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  'google-ai-studio': process.env.GEMINI_API_KEY,
}
const apiKey = apiKeyByProvider[providerType]
if (!apiKey) {
  console.error(
    `Missing API key for provider "${providerType}". Set one of OPENAI_API_KEY, ANTHROPIC_API_KEY, GEMINI_API_KEY.`
  )
  process.exit(1)
}

// The database and storage must be configured before anything imports them.
const workdir = mkdtempSync(path.join(tmpdir(), 'logicle-eval-'))
process.env.DATABASE_URL = `file://${path.join(workdir, 'eval.sqlite')}`
process.env.FILE_STORAGE_LOCATION = workdir
process.env.KNOWLEDGE_BOX_INGESTION_ENABLED = '0' // the harness ingests synchronously instead

const { migrateToLatest } = await import('@/db/migrations')
await migrateToLatest()

const { db } = await import('@/db/database')
const { createContextCompressionArm, createKnowledgeBoxArm, compressionOffArm, allInContextArm } =
  await import('@/backend/lib/eval/arms')
const { builtInScenarios } = await import('@/backend/lib/eval/scenarios/supplierContracts')
const { contextCompressionScenarios } = await import(
  '@/backend/lib/eval/scenarios/contextCompression'
)
const { generateNeedleScenario, generateFlipScenarioPair } = await import(
  '@/backend/lib/eval/scenarios/generator'
)
const { runOne } = await import('@/backend/lib/eval/harness')
const { createJudge } = await import('@/backend/lib/eval/judge')
const { renderMarkdown } = await import('@/backend/lib/eval/report')
const { ChatAssistant } = await import('@/backend/lib/chat')
const { llmModels } = await import('@/lib/models')
const { setTokenizerCounter } = await import('@/backend/lib/chat/prompt-token-counter')
const { countTextWithTokenizer } = await import('@/lib/chat/tokenizer')

// Count tokens in-process rather than in the worker thread the server boots: the harness is a
// short-lived script, and a worker would only add a startup race to every run.
setTokenizerCounter({
  countText: async (tokenizer, text) => countTextWithTokenizer(tokenizer, text),
})

const providerConfig = {
  providerType,
  name: 'eval',
  apiKey,
  provisioned: false,
} as Parameters<typeof ChatAssistant.build>[0]

const resolveModel = (id: string) => {
  const model = llmModels.find((entry) => entry.id === id && entry.provider === providerType)
  if (!model) {
    console.error(
      `Model "${id}" is not defined for provider "${providerType}". Available: ${llmModels
        .filter((entry) => entry.provider === providerType)
        .map((entry) => entry.id)
        .join(', ')}`
    )
    process.exit(1)
  }
  return model
}

const assistantLlmModel = resolveModel(assistantModel)
const userLlmModel = resolveModel(userModelId)
const judgeLlmModel = resolveModel(judgeModelId)

// The knowledge box resolves its ingestion model from configured backends, so the throwaway
// database needs one. Using the same provider keeps the ingestion cost comparable to query cost.
await db
  .insertInto('Backend')
  .values({
    id: 'eval-backend',
    name: 'eval',
    providerType: providerType as never,
    configuration: JSON.stringify({ providerType, apiKey, name: 'eval' }),
    provisioned: 0,
  })
  .execute()

const questions = [
  {
    id: 'summary',
    title: 'Summary',
    prompt: 'What is this document, who are the parties, and what does it govern?',
  },
  {
    id: 'key-numbers',
    title: 'Key numbers',
    prompt:
      'List the concrete figures this document states — amounts, percentages, deadlines, durations — each with what it refers to.',
  },
]

const armRegistry: Record<string, Arm> = {
  'all-in-context': allInContextArm,
  'knowledge-box': createKnowledgeBoxArm({ questions }),
  'knowledge-box-no-projections': createKnowledgeBoxArm({ questions: [] }),
  'compression-off': compressionOffArm,
  'compression-keep-0': createContextCompressionArm({ keepRecentTurns: 0 }),
  'compression-keep-1': createContextCompressionArm({ keepRecentTurns: 1 }),
  'compression-keep-2': createContextCompressionArm({ keepRecentTurns: 2 }),
  'compression-keep-4': createContextCompressionArm({ keepRecentTurns: 4 }),
  'compression-prefetch-keep-0': createContextCompressionArm({
    name: 'compression-prefetch-keep-0',
    keepRecentTurns: 0,
    retrievalMode: 'prefetch',
  }),
  'compression-prefetch-keep-1': createContextCompressionArm({
    name: 'compression-prefetch-keep-1',
    keepRecentTurns: 1,
    retrievalMode: 'prefetch',
  }),
}

if (suite !== 'knowledge' && suite !== 'context-compression') {
  console.error(`Unknown suite "${suite}". Known: knowledge, context-compression`)
  process.exit(1)
}

const armNames =
  list('arms') ??
  (suite === 'context-compression'
    ? [
        'compression-off',
        'compression-keep-0',
        'compression-prefetch-keep-0',
        'compression-prefetch-keep-1',
      ]
    : ['all-in-context', 'knowledge-box', 'knowledge-box-no-projections'])
const arms = armNames.map((name) => {
  const arm = armRegistry[name]
  if (!arm) {
    console.error(`Unknown arm "${name}". Known: ${Object.keys(armRegistry).join(', ')}`)
    process.exit(1)
  }
  return arm
})

const scenarioIds = list('scenario')
const suiteScenarios =
  suite === 'context-compression' ? contextCompressionScenarios : builtInScenarios

// A sweep replaces the built-in scenarios with generated ones, one per corpus size. Each keeps its
// size in its id, so the existing per-scenario report sections read as the points of a curve.
const generatedSpec = (documents: number) => ({
  documents,
  wordsPerDocument: Number(flag('doc-words') ?? 700),
  distractors: Number(flag('distractors') ?? 4),
  needleDepth: Number(flag('needle-depth') ?? 0.5),
  seed: generatedSeed,
})

const scenarios = sweepSizes
  ? sweepSizes.flatMap((documents) =>
      flipTest
        ? generateFlipScenarioPair(generatedSpec(documents), { withhold: flipWithhold })
        : [generateNeedleScenario(generatedSpec(documents))]
    )
  : scenarioIds
  ? scenarioIds.map((id) => {
      const scenario = suiteScenarios.find((entry) => entry.id === id)
      if (!scenario) {
        console.error(
          `Unknown scenario "${id}". Known: ${suiteScenarios.map((entry) => entry.id).join(', ')}`
        )
        process.exit(1)
      }
      return scenario
    })
  : suiteScenarios

if (sweepSizes) {
  for (const scenario of scenarios) {
    const words = scenario.corpus.reduce(
      (total, document) => total + document.text.split(/\s+/).length,
      0
    )
    console.info(`  ${scenario.id}: ${scenario.corpus.length} documents, ~${words} words`)
  }
}

const userModel = ChatAssistant.createLanguageModel(providerConfig, userLlmModel)
const judge = useJudge
  ? createJudge(ChatAssistant.createLanguageModel(providerConfig, judgeLlmModel))
  : undefined

console.info(
  `Running ${scenarios.length} scenario(s) × ${arms.length} arm(s) × ${repeat} repetition(s) = ${
    scenarios.length * arms.length * repeat
  } conversations on ${providerType}/${assistantModel}`
)

const runs: RunResult[] = []
for (const scenario of scenarios) {
  for (const arm of arms) {
    for (let repetition = 0; repetition < repeat; repetition++) {
      const label = `${scenario.id} · ${arm.name} · #${repetition + 1}`
      process.stdout.write(`\n${label}\n`)
      const result = await runOne({
        scenario,
        arm,
        repetition,
        assistant: {
          providerConfig,
          model: assistantLlmModel.id,
          llmModel: assistantLlmModel,
          systemPrompt:
            'You are a company assistant answering questions about internal documents. Answer from the documents only. Always name the document a figure came from. If you cannot find something, say so instead of guessing.',
          tokenLimit: assistantLlmModel.context_length,
        },
        userModel,
        judge,
        onProgress: verbose ? (line) => process.stdout.write(`${line}\n`) : undefined,
      })
      runs.push(result)
      process.stdout.write(
        `  → ${result.outcome} · score ${result.score.toFixed(2)} · ${
          result.totals.inputTokens
        } in / ${result.totals.outputTokens} out · ${result.totals.toolCalls} tool call(s)\n`
      )
      if (result.deterministic.missing.length > 0) {
        process.stdout.write(`  → missing: ${result.deterministic.missing.join(', ')}\n`)
      }
      if (result.deterministic.forbidden.length > 0) {
        process.stdout.write(
          `  → wrong figure quoted: ${result.deterministic.forbidden.join(', ')}\n`
        )
      }
    }
  }
}

const markdown = renderMarkdown(runs, baselineArm)
process.stdout.write(`\n${markdown}\n`)

if (out) {
  await writeFile(out, markdown, 'utf-8')
  console.info(`Report written to ${out}`)
}

const runsOut = flag('runs-out')
if (runsOut) {
  let gitRevision: string | undefined
  let gitDirty: boolean | undefined
  try {
    gitRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    gitDirty =
      execFileSync('git', ['status', '--porcelain'], {
        cwd: process.cwd(),
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim().length > 0
  } catch {
    // The runner also works from a source archive; revision metadata is useful, not required.
  }
  const artifact: EvaluationArtifact = {
    version: 1,
    createdAt: new Date().toISOString(),
    metadata: {
      gitRevision,
      gitDirty,
      provider: providerType,
      assistantModel: assistantLlmModel.id,
      userModel: userLlmModel.id,
      judgeModel: useJudge ? judgeLlmModel.id : undefined,
      baselineArm,
      arms: arms.map((arm) => arm.name),
      scenarios: scenarios.map((scenario) => scenario.id),
      repeat,
      suite,
      sweep: sweepSizes
        ? {
            documents: sweepSizes,
            wordsPerDocument: Number(flag('doc-words') ?? 700),
            distractors: Number(flag('distractors') ?? 4),
            needleDepth: Number(flag('needle-depth') ?? 0.5),
            seed: generatedSeed,
            flipWithhold: flipTest ? flipWithhold : undefined,
          }
        : undefined,
    },
    runs,
  }
  await writeFile(runsOut, JSON.stringify(artifact, null, 2), 'utf-8')
  console.info(`Run artifact written to ${runsOut}`)
}

await db.destroy()
rmSync(workdir, { recursive: true, force: true })
process.exit(0)
