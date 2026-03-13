import { error, errorSpec, notFound, operation, responseSpec, route } from '@/lib/routes'
import { getFileWithId } from '@/models/file'
import * as dto from '@/types/dto'
import { getFileAnalysis, inferFileAnalysisKind } from '@/models/fileAnalysis'
import { ensureFileAnalysisForFile, fileAnalyzerVersion } from '@/lib/fileAnalysis'

export const { GET } = route({
  GET: operation({
    name: 'Get file analysis',
    authentication: 'user',
    responses: [responseSpec(200, dto.fileAnalysisSchema), errorSpec(404), errorSpec(409)] as const,
    implementation: async (_req: Request, params: { fileId: string }) => {
      const file = await getFileWithId(params.fileId)
      if (!file) {
        return notFound()
      }

      if (file.uploaded !== 1) {
        return error(409, 'File upload is not complete yet')
      }

      const analysis = await getFileAnalysis(params.fileId)
      if (analysis && analysis.analyzerVersion >= fileAnalyzerVersion) {
        return { status: 200 as const, body: analysis }
      }

      const completed = await ensureFileAnalysisForFile(file)
      if (completed) {
        return { status: 200 as const, body: completed }
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
  }),
})
