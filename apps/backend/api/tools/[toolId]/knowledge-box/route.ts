import { errorSpec, notFound, ok, operation, responseSpec } from '@/lib/routes'
import { getTool } from '@/models/tool'
import { knowledgeBoxStatusSchema } from '@/types/dto/knowledgebox'
import { isKnowledgeBoxType, reindexKnowledgeBox } from '@/backend/lib/knowledge/lifecycle'
import { listBoxDocuments, loadBoxProjections } from '@/backend/lib/knowledge/store'

export const dynamic = 'force-dynamic'

const loadStatus = async (toolId: string) => {
  const documents = await listBoxDocuments(toolId)
  const projections = await loadBoxProjections(toolId)
  const projectionCounts = new Map<string, number>()
  for (const projection of projections) {
    projectionCounts.set(projection.fileId, (projectionCounts.get(projection.fileId) ?? 0) + 1)
  }
  return {
    documents: documents.map((document) => ({
      fileId: document.fileId,
      status: document.status,
      error: document.error,
      chunkCount: document.chunkCount,
      projectionCount: projectionCounts.get(document.fileId) ?? 0,
      updatedAt: document.updatedAt,
    })),
  }
}

export const GET = operation({
  name: 'Get knowledge box status',
  description: 'Per-document ingestion status of a knowledge box tool.',
  authentication: 'admin',
  responses: [responseSpec(200, knowledgeBoxStatusSchema), errorSpec(404)] as const,
  implementation: async ({ params }) => {
    const tool = await getTool(params.toolId)
    if (!tool || !isKnowledgeBoxType(tool.type)) {
      return notFound('No such knowledge box')
    }
    return ok(await loadStatus(params.toolId))
  },
})

export const POST = operation({
  name: 'Reindex knowledge box',
  description: 'Queue every document of a knowledge box for re-ingestion.',
  authentication: 'admin',
  responses: [responseSpec(200, knowledgeBoxStatusSchema), errorSpec(404)] as const,
  implementation: async ({ params }) => {
    const tool = await getTool(params.toolId)
    if (!tool || !isKnowledgeBoxType(tool.type)) {
      return notFound('No such knowledge box')
    }
    await reindexKnowledgeBox(params.toolId)
    return ok(await loadStatus(params.toolId))
  },
})
