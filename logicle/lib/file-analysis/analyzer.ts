import * as dto from '@/types/dto'

export const fileAnalyzerVersion = 'prep-v1'

export type AnalyzeFileRequest = {
  fileId: string
  path: string
  mimeType: string
  encrypted: boolean
  size: number
}

export type AnalyzeFileResult =
  | {
      ok: true
      payload: dto.FileAnalysisPayload
    }
  | {
      ok: false
      error: string
    }

export interface FileAnalyzer {
  analyzeFile(input: AnalyzeFileRequest): Promise<AnalyzeFileResult>
}
