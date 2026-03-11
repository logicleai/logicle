import { PDF, PdfDict, PdfName, PdfRef } from '@libpdf/core'
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

interface LibPdfPageLike {
  index: number
  width: number
  height: number
  getContentBytes(): Uint8Array
  getResources(): PdfDict | null
  extractText(): { text: string }
}

type PageGraphicsAnalysis = {
  imageCount: number
  geometryComplexity: number
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
  const pdf = await PDF.load(pdfBuffer)
  let pageCount = 0
  let visionPageCount = 0
  const pageTexts: string[] = []

  for (const page of pdf.getPages()) {
    pageCount += 1
    pageTexts.push(page.extractText().text)
    const graphics = analyzePageGraphics(pdf, page as never as LibPdfPageLike)
    const isVisionPage = graphics.imageCount > 0 || graphics.geometryComplexity >= 150
    if (isVisionPage) {
      visionPageCount += 1
    }
  }

  const textTokenCount = countTextTokens(normalizeText(pageTexts.join('\n')))

  return {
    pageCount,
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

const analyzePageGraphics = (pdf: PDF, page: LibPdfPageLike): PageGraphicsAnalysis => {
  const contentBytes = page.getContentBytes()
  const content = new TextDecoder('latin1').decode(contentBytes)
  const imageXObjects = getImageXObjects(pdf, page.getResources(), page.index + 1)

  let imageCount = countInlineImages(content)
  for (const imageXObject of imageXObjects) {
    imageCount += countPaintXObjectUsages(content, imageXObject.name)
  }

  return {
    imageCount,
    geometryComplexity: estimateGeometryComplexity(content),
  }
}

const getImageXObjects = (
  pdf: PDF,
  resources: PdfDict | null,
  pageNumber: number
): Array<{ name: string; id: string }> => {
  const images: Array<{ name: string; id: string }> = []
  const xObjectDict = resources?.get(PdfName.of('XObject'))
  if (!(xObjectDict instanceof PdfDict)) {
    return images
  }

  for (const key of xObjectDict.keys()) {
    const operatorName = pdfNameToOperatorName(key)
    const rawValue = xObjectDict.get(operatorName)
    const xObject = resolvePdfObject(pdf, rawValue)
    if (!(xObject instanceof PdfDict)) {
      continue
    }
    if (xObject.getName('Subtype')?.value === 'Image') {
      images.push({
        name: operatorName,
        id: pdfObjectIdentity(rawValue, pageNumber, operatorName),
      })
    }
  }

  return images
}

const resolvePdfObject = (pdf: PDF, value: unknown): unknown => {
  if (value instanceof PdfRef) {
    return pdf.getObject(value)
  }
  return value
}

const pdfNameToOperatorName = (value: unknown): string => {
  if (value instanceof PdfName) {
    return value.value
  }
  return String(value).replace(/^\//, '')
}

const pdfObjectIdentity = (value: unknown, pageNumber: number, operatorName: string): string => {
  if (value instanceof PdfRef) {
    return String(value)
  }
  return `page:${pageNumber}:${operatorName}`
}

const countPaintXObjectUsages = (content: string, xObjectName: string): number => {
  const escapedName = escapeRegExp(xObjectName)
  const matches = content.match(new RegExp(`/${escapedName}\\s+Do\\b`, 'g'))
  return matches?.length ?? 0
}

const countInlineImages = (content: string): number => {
  const matches = content.match(/(?:^|[\s])BI(?=[\s\r\n])/g)
  return matches?.length ?? 0
}

const estimateGeometryComplexity = (content: string): number => {
  const operatorMatches = content.match(/\b(?:S|s|f|F|f\*|B|B\*|b|b\*|Do|BI|EI)\b/g)
  return operatorMatches?.length ?? 0
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
