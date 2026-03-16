import type * as dto from '@/types/dto'
import type { LlmModel } from '@/lib/chat/models'

export type PdfAnalysisPayload = Extract<dto.FileAnalysisPayload, { kind: 'pdf' }>
export type ImageAnalysisPayload = Extract<dto.FileAnalysisPayload, { kind: 'image' }>

export const isPdfAnalysisPayload = (
  payload: dto.FileAnalysis['payload']
): payload is PdfAnalysisPayload => payload?.kind === 'pdf'

export const isImageAnalysisPayload = (
  payload: dto.FileAnalysis['payload']
): payload is ImageAnalysisPayload => payload?.kind === 'image'

export const isPdfOverNativePageLimit = (
  payload: PdfAnalysisPayload,
  model: LlmModel
): boolean => {
  const nativePdfPageLimit = model.capabilities.nativePdfPageLimit
  return nativePdfPageLimit !== undefined && payload.pageCount > nativePdfPageLimit
}
