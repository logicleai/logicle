import { extractImages, extractText, getDocumentProxy } from 'unpdf'
import { LlmModel } from './models'

export type PdfTokenEstimateFeatures = {
  pageCount: number
  visionPageCount: number
  textTokenCount: number
}

type PdfEstimatorFeatureKey = 'vision_page_count' | 'page_count' | 'text_token_count'

type PdfEstimatorModel = {
  model_type: 'linear' | 'per-page-default'
  feature_keys: PdfEstimatorFeatureKey[]
  intercept: number
  weights: number[]
  trained_at: string
}

const pdfEstimatorModels: Record<'openai' | 'anthropic', PdfEstimatorModel> = {
  openai: {
    model_type: 'linear',
    feature_keys: ['vision_page_count', 'page_count', 'text_token_count'],
    intercept: 9.357196401421788,
    weights: [1250.4471582825092, 13.766225362254438, 1.1342632221667341],
    trained_at: '2026-03-10T22:04:08.508Z',
  },
  anthropic: {
    model_type: 'linear',
    feature_keys: ['vision_page_count', 'page_count', 'text_token_count'],
    intercept: 26.53813009584519,
    weights: [1.65001802114557, 1572.8790151597427, 1.0741231860618194],
    trained_at: '2026-03-10T15:51:04.226Z',
  },
}

const defaultPdfEstimatorModel: PdfEstimatorModel = {
  model_type: 'per-page-default',
  feature_keys: ['vision_page_count', 'page_count', 'text_token_count'],
  intercept: 0,
  weights: [0, 2000, 0],
  trained_at: '2026-03-11T00:00:00.000Z',
}

export const resolvePdfEstimatorModel = (model: LlmModel): PdfEstimatorModel => {
  switch (model.owned_by) {
    case 'openai':
      return pdfEstimatorModels.openai
    case 'anthropic':
      return pdfEstimatorModels.anthropic
    default:
      return defaultPdfEstimatorModel
  }
}

export const predictPdfTokenCount = (
  estimatorModel: PdfEstimatorModel,
  features: PdfTokenEstimateFeatures
) => {
  const featureValues = [
    Math.max(0, features.visionPageCount),
    Math.max(1, features.pageCount),
    Math.max(0, features.textTokenCount),
  ]
  const linearValue =
    estimatorModel.intercept +
    estimatorModel.weights.reduce((sum, weight, idx) => sum + weight * featureValues[idx], 0)
  return Math.max(0, linearValue)
}

export const extractPdfTokenEstimateFeatures = async (
  pdfBuffer: Buffer,
  countTextTokens: (text: string) => number
): Promise<PdfTokenEstimateFeatures> => {
  const pdf = await getDocumentProxy(new Uint8Array(pdfBuffer))
  const { totalPages, text } = await extractText(pdf, { mergePages: false })

  let visionPageCount = 0
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    const images = await extractImages(pdf, pageNumber)
    if (images.length > 0) {
      visionPageCount += 1
    }
  }

  const pageTexts = Array.isArray(text) ? text : [text]
  const textTokenCount = countTextTokens(normalizeText(pageTexts.join('\n')))

  return {
    pageCount: totalPages,
    visionPageCount,
    textTokenCount,
  }
}

export const estimateNativePdfTokens = async (
  model: LlmModel,
  pdfBuffer: Buffer,
  countTextTokens: (text: string) => number
) => {
  const estimatorModel = resolvePdfEstimatorModel(model)
  const features = await extractPdfTokenEstimateFeatures(pdfBuffer, countTextTokens)
  return predictPdfTokenCount(estimatorModel, features)
}

const normalizeText = (text: string) => text.replace(/\s+/g, ' ').trim()
