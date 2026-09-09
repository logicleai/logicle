import { nanoid } from 'nanoid'
import { db } from '@/db/database'
import { KnowledgeBoxInterface, type KnowledgeBoxQuestion } from '@/lib/tools/schemas'
import { KnowledgeBoxTool } from '@/backend/lib/tools/knowledge_box/implementation'
import { ingestDocument } from '@/backend/lib/knowledge/ingest'
import {
  computeConfigHash,
  deleteBox,
  saveIngestResult,
  syncBoxDocuments,
} from '@/backend/lib/knowledge/store'
import { invalidateBoxIndex } from '@/backend/lib/knowledge/retrieval'
import type { Arm, ArmSetup, ArmSetupContext, SetupCost } from './types'

/**
 * The arms shipped with the harness: the two ways Logicle can put documents in front of a model,
 * plus a variant that isolates one half of the knowledge box.
 *
 * Arms are the extension point. Anything expressible as "same scenario, different assistant
 * configuration" belongs here: context compression on/off, router versus direct, two chunkings.
 */

/** Today's behaviour: every document goes into the preamble, every turn, in full. */
export const allInContextArm: Arm = {
  name: 'all-in-context',
  description: 'Every corpus document is attached as assistant knowledge and sent in the preamble.',
  setup: async ({ files }: ArmSetupContext): Promise<ArmSetup> => ({
    tools: [],
    knowledge: files,
  }),
}

export interface KnowledgeBoxArmOptions {
  /** Questions asked of every document at ingestion. Empty means chunks-only retrieval. */
  questions?: KnowledgeBoxQuestion[]
  name?: string
  description?: string
}

/**
 * Documents reachable only through the `knowledge_box` tool.
 *
 * Ingestion runs synchronously here rather than through the background loop: the run must not
 * start before the index exists, and the tokens ingestion spends have to be attributed to this
 * arm. Reporting them is the whole reason `computeProjections` returns usage — an index that is
 * cheap to query and expensive to build is not free, and a benchmark that hides the build cost
 * would make the knowledge box look better than it is.
 */
export const createKnowledgeBoxArm = (options: KnowledgeBoxArmOptions = {}): Arm => {
  const questions = options.questions ?? []
  return {
    name: options.name ?? (questions.length > 0 ? 'knowledge-box' : 'knowledge-box-no-projections'),
    description:
      options.description ??
      (questions.length > 0
        ? `Documents behind the knowledge_box tool, with ${questions.length} ingestion question(s).`
        : 'Documents behind the knowledge_box tool, chunk retrieval only, no ingestion questions.'),
    setup: async ({ files, runId }: ArmSetupContext): Promise<ArmSetup> => {
      const boxId = `eval-box-${runId}-${nanoid(6)}`
      const now = new Date().toISOString()
      const configuration = {
        files: files.map((file) => ({
          id: file.id,
          name: file.name,
          type: file.type,
          size: file.size,
        })),
        questions,
        maxSearchResults: 8,
      }

      await db
        .insertInto('Tool')
        .values({
          id: boxId,
          type: KnowledgeBoxInterface.toolName,
          name: 'Knowledge box',
          description: 'Evaluation knowledge box',
          imageId: null,
          tags: '[]',
          promptFragment: '',
          configuration: JSON.stringify(configuration),
          provisioned: 0,
          capability: 0,
          sharing: 'public',
          satelliteId: null,
          enabled: 1,
          createdAt: now,
          updatedAt: now,
        })
        .execute()

      await syncBoxDocuments(
        boxId,
        files.map((file) => file.id),
        computeConfigHash(questions)
      )

      const setupCost: SetupCost = { inputTokens: 0, outputTokens: 0, calls: 0, wallMs: 0 }
      const startedAt = Date.now()
      for (const file of files) {
        const result = await ingestDocument(boxId, file.id)
        await saveIngestResult(boxId, file.id, result)
        setupCost.inputTokens += result.projectionUsage.inputTokens
        setupCost.outputTokens += result.projectionUsage.outputTokens
        setupCost.calls += result.projectionUsage.calls
      }
      setupCost.wallMs = Date.now() - startedAt
      invalidateBoxIndex(boxId)

      const tool = new KnowledgeBoxTool(
        { id: boxId, name: 'knowledge_box', provisioned: false, promptFragment: '' },
        { ...configuration, questions, maxSearchResults: 8 }
      )

      return {
        tools: [tool],
        knowledge: [],
        systemPromptSuffix:
          'The documents you need are not in this conversation. Use the knowledge box: call list_documents first to see what exists, then search, then read only what you need.',
        setupCost,
        teardown: async () => {
          await deleteBox(boxId)
          await db.deleteFrom('Tool').where('id', '=', boxId).execute()
        },
      }
    },
  }
}
