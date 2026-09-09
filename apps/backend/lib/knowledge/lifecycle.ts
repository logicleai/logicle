import { logger } from '@/lib/logging'
import { KnowledgeBoxInterface, KnowledgeBoxSchema } from '@/lib/tools/schemas'
import { invalidateBoxIndex } from './retrieval'
import { scheduleKnowledgeIngestion } from './runtime'
import { computeConfigHash, deleteBox, requeueBoxDocuments, syncBoxDocuments } from './store'

/**
 * Keeps the ingestion state of a knowledge box in step with the tool it lives in. Called from the
 * `Tool` model on create/update/delete so that attaching a file or editing a question is enough to
 * get it indexed — there is no separate "reindex" step an admin has to remember.
 */

export const isKnowledgeBoxType = (type: string): boolean => type === KnowledgeBoxInterface.toolName

export const syncKnowledgeBoxConfiguration = async (
  toolId: string,
  type: string,
  configuration: Record<string, unknown>
): Promise<void> => {
  if (!isKnowledgeBoxType(type)) return

  const parsed = KnowledgeBoxSchema.safeParse(configuration)
  if (!parsed.success) {
    logger.warn('[knowledge-box] ignoring unparseable configuration', {
      toolId,
      error: parsed.error.message,
    })
    return
  }

  const fileIds = parsed.data.files.map((file) => file.id)
  await syncBoxDocuments(toolId, fileIds, computeConfigHash(parsed.data.questions))
  invalidateBoxIndex(toolId)
  scheduleKnowledgeIngestion()
}

export const reindexKnowledgeBox = async (toolId: string): Promise<number> => {
  const requeued = await requeueBoxDocuments(toolId)
  invalidateBoxIndex(toolId)
  scheduleKnowledgeIngestion()
  return requeued
}

export const deleteKnowledgeBox = async (toolId: string): Promise<void> => {
  await deleteBox(toolId)
  invalidateBoxIndex(toolId)
}
