import type * as schema from '@/db/schema'
import type { CompletedFileAnalysis } from '@/lib/fileAnalysis'
import { isReadyFileAnalysis } from '@/lib/fileAnalysis'
import { isPdfAnalysisPayload } from '@/lib/fileAnalysisPayload'
import type { LlmModel, LlmModelCapabilities } from './models'

export const acceptableImageTypes = ['image/jpeg', 'image/png', 'image/webp']

export const canSendAsNativeImage = (fileType: string, capabilities: LlmModelCapabilities) =>
  capabilities.vision && acceptableImageTypes.includes(fileType)

export const canSendAsNativeFile = (fileType: string, capabilities: LlmModelCapabilities) =>
  capabilities.supportedMedia?.includes(fileType) ?? false

export const createPdfAttachmentLimitText = (
  fileEntry: Pick<schema.File, 'id' | 'name'>,
  pageCount: number,
  nativePdfPageLimit: number
) =>
  `The file "${fileEntry.name}" with id ${fileEntry.id} could not be sent as an attachment: it has too many pages (${pageCount} pages, limit is ${nativePdfPageLimit}). It is possible that some tools can return the content on demand`

export const resolvePdfNativeAttachmentDecision = (
  fileEntry: Pick<schema.File, 'id' | 'name' | 'type'>,
  capabilities: LlmModelCapabilities,
  analysis: CompletedFileAnalysis
): { kind: 'native-file' } | { kind: 'text-fallback'; text: string; reason: 'analysis-failed' | 'unexpected-payload' | 'page-limit' } => {
  if (fileEntry.type !== 'application/pdf' || capabilities.nativePdfPageLimit === undefined) {
    return { kind: 'native-file' }
  }
  if (!isReadyFileAnalysis(analysis)) {
    return {
      kind: 'text-fallback',
      text: '',
      reason: 'analysis-failed',
    }
  }
  if (!isPdfAnalysisPayload(analysis.payload)) {
    return {
      kind: 'text-fallback',
      text: '',
      reason: 'unexpected-payload',
    }
  }
  if (analysis.payload.pageCount > capabilities.nativePdfPageLimit) {
    return {
      kind: 'text-fallback',
      text: createPdfAttachmentLimitText(
        fileEntry,
        analysis.payload.pageCount,
        capabilities.nativePdfPageLimit
      ),
      reason: 'page-limit',
    }
  }
  return { kind: 'native-file' }
}

export const getPdfAttachmentPageLimitText = (
  attachment: Pick<{ id: string; name: string }, 'id' | 'name'>,
  pageCount: number,
  model: LlmModel
) => {
  const nativePdfPageLimit = model.capabilities.nativePdfPageLimit
  if (nativePdfPageLimit === undefined) return null
  return createPdfAttachmentLimitText(attachment, pageCount, nativePdfPageLimit)
}
