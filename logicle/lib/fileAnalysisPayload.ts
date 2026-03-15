import type * as dto from '@/types/dto'
import type { LlmModel } from '@/lib/chat/models'

export const isPdfAnalysisPayload = (
  payload: dto.FileAnalysis['payload'] | undefined
): payload is Extract<dto.FileAnalysisPayload, { kind: 'pdf' }> => payload?.kind === 'pdf'

export const isImageAnalysisPayload = (
  payload: dto.FileAnalysis['payload'] | undefined
): payload is Extract<dto.FileAnalysisPayload, { kind: 'image' }> => payload?.kind === 'image'

export const getPdfNativePageLimit = (model: LlmModel) => model.capabilities.nativePdfPageLimit

export const isPdfOverNativePageLimit = (
  payload: dto.FileAnalysis['payload'] | undefined,
  model: LlmModel
): boolean => {
  if (!isPdfAnalysisPayload(payload)) return false
  const nativePdfPageLimit = getPdfNativePageLimit(model)
  return nativePdfPageLimit !== undefined && payload.pageCount > nativePdfPageLimit
}

export const getPdfTokenFeatures = (payload: dto.FileAnalysis['payload'] | undefined) => {
  if (!isPdfAnalysisPayload(payload)) return null
  return {
    pageCount: payload.pageCount,
    visionPageCount: payload.visionPageCount,
  }
}

export const getImageTokenFeatures = (payload: dto.FileAnalysis['payload'] | undefined) => {
  if (!isImageAnalysisPayload(payload)) return null
  return {
    width: payload.width,
    height: payload.height,
  }
}
