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

export const getPdfNativePageLimit = (model: LlmModel) => model.capabilities.nativePdfPageLimit

export const isPdfOverNativePageLimit = (
  payload: PdfAnalysisPayload,
  model: LlmModel
): boolean => {
  const nativePdfPageLimit = getPdfNativePageLimit(model)
  return nativePdfPageLimit !== undefined && payload.pageCount > nativePdfPageLimit
}

export const getPdfTokenFeatures = (payload: PdfAnalysisPayload) => {
  return {
    pageCount: payload.pageCount,
    visionPageCount: payload.visionPageCount,
  }
}

export const getImageTokenFeatures = (payload: ImageAnalysisPayload) => {
  return {
    width: payload.width,
    height: payload.height,
  }
}
