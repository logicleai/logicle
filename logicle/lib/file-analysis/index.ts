import env from '@/lib/env'
import * as schema from '@/db/schema'
import { LocalWorkerFileAnalyzer } from './LocalWorkerFileAnalyzer'
import { RemoteFileAnalyzer } from './RemoteFileAnalyzer'
import { fileAnalysisRuntime } from './runtime'
import { inferFileAnalysisKind, upsertPendingFileAnalysis } from '@/models/fileAnalysis'
import { FileAnalyzer } from './analyzer'

const createFileAnalyzer = (): FileAnalyzer => {
  if (env.fileAnalysis.provider === 'remote') {
    return new RemoteFileAnalyzer()
  }
  return new LocalWorkerFileAnalyzer()
}

export const fileAnalyzer = createFileAnalyzer()

export const scheduleFileAnalysisForFile = async (file: schema.File): Promise<void> => {
  if (!env.fileAnalysis.enable) {
    return
  }

  await upsertPendingFileAnalysis(file.id, inferFileAnalysisKind(file.type))
  fileAnalysisRuntime.enqueue(file.id)
}

export const startFileAnalysisRuntime = async (): Promise<void> => {
  await fileAnalysisRuntime.start(fileAnalyzer)
}
