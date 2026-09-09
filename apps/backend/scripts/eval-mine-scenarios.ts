/**
 * Derives benchmark scenario drafts from real conversations in a Logicle database.
 *
 * Hand-written scenarios test what their author already suspects. This reads what people actually
 * asked and proposes goals, personas and rubrics from it. The output is a draft: every entry
 * carries `needsReview: true`, and its `candidateFacts` are the model's guess at what mattered,
 * to be checked against the source documents before any of it is trusted as an answer key.
 *
 * Point it at a snapshot, never at a live production database:
 *   logicle-infra-deploy's `cli/backup_db_to_sqlite_native` produces a suitable SQLite file.
 *
 * The drafts contain verbatim user and assistant text. Treat the output file as production data:
 * it belongs wherever that tenant's data is allowed to live, and nowhere else.
 *
 * Usage:
 *   OPENAI_API_KEY=... npx tsx apps/backend/scripts/eval-mine-scenarios.ts \
 *     --db /path/to/snapshot.sqlite --limit 20 --out drafts.json
 *
 * Flags:
 *   --db <path|url>     SQLite file or postgres URL to read (required)
 *   --limit <n>         conversations to mine, longest first (default: 10)
 *   --assistant <id>    restrict to one assistant
 *   --min-messages <n>  skip conversations shorter than this (default: 4)
 *   --provider <type>   openai | anthropic | google-ai-studio (default: openai)
 *   --model <id>        model doing the mining (default: gpt-4o-mini)
 *   --out <path>        where to write the drafts (default: stdout)
 */

export {}

import { writeFile } from 'node:fs/promises'
import type { ScenarioDraft } from '@/backend/lib/eval/scenarioMining'
import type { TranscriptEntry } from '@/backend/lib/eval/types'

const args = process.argv.slice(2).filter((arg) => arg !== '--')
const flag = (name: string): string | undefined => {
  const index = args.indexOf(`--${name}`)
  return index === -1 ? undefined : args[index + 1]
}

const dbTarget = flag('db')
if (!dbTarget) {
  console.error('Missing --db. Point it at a Logicle database snapshot, not a live database.')
  process.exit(1)
}

const providerType = flag('provider') ?? 'openai'
const modelId = flag('model') ?? 'gpt-4o-mini'
const limit = Number(flag('limit') ?? 10)
const minMessages = Number(flag('min-messages') ?? 4)
const assistantId = flag('assistant')

const apiKeyByProvider: Record<string, string | undefined> = {
  openai: process.env.OPENAI_API_KEY,
  anthropic: process.env.ANTHROPIC_API_KEY,
  'google-ai-studio': process.env.GEMINI_API_KEY,
}
const apiKey = apiKeyByProvider[providerType]
if (!apiKey) {
  console.error(`Missing API key for provider "${providerType}".`)
  process.exit(1)
}

process.env.DATABASE_URL = dbTarget.includes('://') ? dbTarget : `file://${dbTarget}`
process.env.FILE_STORAGE_LOCATION = process.env.FILE_STORAGE_LOCATION ?? '.'

const { db } = await import('@/db/database')
const { renderMessagePlainText } = await import('@/backend/lib/chat/message-projection')
const { mineScenarioDraft } = await import('@/backend/lib/eval/scenarioMining')
const { ChatAssistant } = await import('@/backend/lib/chat')
const { llmModels } = await import('@/lib/models')

const model = llmModels.find((entry) => entry.id === modelId && entry.provider === providerType)
if (!model) {
  console.error(`Model "${modelId}" is not defined for provider "${providerType}".`)
  process.exit(1)
}

const languageModel = ChatAssistant.createLanguageModel(
  { providerType, name: 'mine', apiKey, provisioned: false } as Parameters<
    typeof ChatAssistant.createLanguageModel
  >[0],
  model
)

let query = db
  .selectFrom('Conversation')
  .select(['id', 'name', 'assistantId'])
  .orderBy('lastMsgSentAt', 'desc')
  .limit(limit * 4)
if (assistantId) query = query.where('assistantId', '=', assistantId)
const conversations = await query.execute()

console.error(`Scanning ${conversations.length} conversation(s)…`)

const drafts: ScenarioDraft[] = []
for (const conversation of conversations) {
  if (drafts.length >= limit) break

  const rows = await db
    .selectFrom('Message')
    .select(['id', 'role', 'content', 'sentAt'])
    .where('conversationId', '=', conversation.id)
    .orderBy('sentAt', 'asc')
    .execute()

  // Only user and assistant turns carry the intent; tool traffic is noise for this purpose.
  const transcript: TranscriptEntry[] = rows
    .filter((row) => row.role === 'user' || row.role === 'assistant')
    .map((row) => {
      let text = ''
      try {
        text = renderMessagePlainText({
          ...row,
          conversationId: conversation.id,
          content: JSON.parse(row.content),
        } as never)
      } catch {
        text = ''
      }
      return { role: row.role as TranscriptEntry['role'], text }
    })
    .filter((entry) => entry.text.trim().length > 0)

  if (transcript.length < minMessages) continue

  try {
    const draft = await mineScenarioDraft(languageModel, conversation.id, transcript)
    if (!draft.usable) {
      console.error(`  skipped ${conversation.id}: ${draft.skipReason}`)
      continue
    }
    drafts.push(draft)
    console.error(`  mined ${conversation.id}: ${draft.goal.slice(0, 80)}`)
  } catch (error) {
    console.error(
      `  failed ${conversation.id}: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

const output = JSON.stringify(drafts, null, 2)
const out = flag('out')
if (out) {
  await writeFile(out, output, 'utf-8')
  console.error(
    `\n${drafts.length} draft(s) written to ${out}. Every one needs review: confirm each candidate fact against the source documents before using it as an answer key.`
  )
} else {
  process.stdout.write(`${output}\n`)
}

await db.destroy()
process.exit(0)
