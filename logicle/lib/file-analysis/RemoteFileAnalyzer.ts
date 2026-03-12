import { AnalyzeFileRequest, AnalyzeFileResult, FileAnalyzer } from './analyzer'

export class RemoteFileAnalyzer implements FileAnalyzer {
  async analyzeFile(_input: AnalyzeFileRequest): Promise<AnalyzeFileResult> {
    return {
      ok: false,
      error: 'Remote file analyzer is not implemented',
    }
  }
}
