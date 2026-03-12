import { errorSpec, notFound, operation, responseSpec, route } from '@/lib/routes'
import * as dto from '@/types/dto'
import { getFileAnalysis } from '@/models/fileAnalysis'

export const { GET } = route({
  GET: operation({
    name: 'Get file analysis',
    authentication: 'user',
    responses: [responseSpec(200, dto.fileAnalysisSchema), errorSpec(404)] as const,
    implementation: async (_req: Request, params: { fileId: string }) => {
      const analysis = await getFileAnalysis(params.fileId)
      if (!analysis) {
        return notFound()
      }
      return {
        status: 200 as const,
        body: analysis,
      }
    },
  }),
})
