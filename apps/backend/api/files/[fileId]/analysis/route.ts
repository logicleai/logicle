import { error, errorSpec, forbidden, notFound, operation, responseSpec } from '@/lib/routes'
import { getFileWithId } from '@/models/file'
import * as dto from '@/types/dto'
import { getFileAnalysis, inferFileAnalysisKind } from '@/models/fileAnalysis'
import { ensureFileAnalysisForFile, fileAnalyzerVersion } from '@/lib/file-analysis'
import { canAccessFile } from '@/backend/lib/files/authorization'
import { llmModels } from '@/lib/models'
import env from '@/lib/env'
import { z } from 'zod'

const computeWarnings = (analysis: dto.FileAnalysis, modelId: string | null): string[] => {
  if (!modelId || analysis.payload?.kind !== 'pdf') return []
  const model = llmModels.find((m) => m.id === modelId)
  const limit = model?.capabilities.nativePdfPageLimit
  if (limit !== undefined && analysis.payload.pageCount > limit) {
    return ['anthropic_pdf_native_page_limit']
  }
  return []
}

export const GET = operation({
  name: 'Get file analysis',
  authentication: 'user',
  querySchema: z.object({
    modelId: z.string().optional(),
  }),
  responses: [responseSpec(200, dto.fileAnalysisSchema), errorSpec(403), errorSpec(404), errorSpec(409)] as const,
  implementation: async ({ params, query, session }) => {
    const file = await getFileWithId(params.fileId)
    if (!file) {
      return notFound()
    }

    if (!(await canAccessFile(session, params.fileId))) {
      return forbidden()
    }

    if (!file.fileBlobId) {
      return error(409, 'File upload is not complete yet')
    }
    const modelId = query.modelId ?? null

    const analysis = await getFileAnalysis(params.fileId)
    if (analysis && analysis.analyzerVersion >= fileAnalyzerVersion) {
      return {
        status: 200 as const,
        body: { ...analysis, warnings: computeWarnings(analysis, modelId) },
      }
    }

    const completed = await ensureFileAnalysisForFile(file, env.fileAnalysis.waitMs)
    if (completed) {
      return {
        status: 200 as const,
        body: { ...completed, warnings: computeWarnings(completed, modelId) },
      }
    }

    return {
      status: 200 as const,
      body: {
        fileId: file.id,
        kind: inferFileAnalysisKind(file.type),
        status: 'unavailable' as const,
        analyzerVersion: fileAnalyzerVersion,
        payload: null,
        error: null,
        createdAt: file.createdAt,
        updatedAt: file.createdAt,
      },
    }
  },
})
