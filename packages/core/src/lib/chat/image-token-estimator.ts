import sharp from 'sharp'
import { LlmModel } from './models'

type ImageDimensions = {
  width: number
  height: number
}

type OpenAiTileCost = {
  mode: 'tile'
  baseTokens: number
  tileTokens: number
}

type OpenAiPatchCost = {
  mode: 'patch'
  patchBudget: number
  multiplier: number
  maxDimension: number
}

type OpenAiImageEstimator = OpenAiTileCost | OpenAiPatchCost

const getImageDimensions = async (imageBuffer: Buffer): Promise<ImageDimensions> => {
  const metadata = await sharp(imageBuffer).metadata()
  if (!metadata.width || !metadata.height) {
    throw new Error('Unable to determine image dimensions')
  }
  return {
    width: metadata.width,
    height: metadata.height,
  }
}

const getOpenAiEstimator = (model: LlmModel): OpenAiImageEstimator => {
  if (model.id === 'computer-use-preview') {
    return { mode: 'tile', baseTokens: 65, tileTokens: 129 }
  }
  if (model.id === 'gpt-4o-mini') {
    return { mode: 'tile', baseTokens: 2833, tileTokens: 5667 }
  }
  if (model.id === 'o1' || model.id === 'o1-pro' || model.id === 'o3') {
    return { mode: 'tile', baseTokens: 75, tileTokens: 150 }
  }
  if (
    model.id === 'gpt-5-mini' ||
    model.id === 'gpt-5-nano' ||
    model.id === 'gpt-5.2' ||
    model.id === 'gpt-5.2-chat-latest' ||
    model.id === 'o4-mini' ||
    model.id === 'gpt-4.1-mini' ||
    model.id === 'gpt-4.1-nano' ||
    model.id.startsWith('gpt-5.3-codex') ||
    model.id.startsWith('gpt-5.2-codex') ||
    model.id.startsWith('gpt-5-codex-mini') ||
    model.id.startsWith('gpt-5.1-codex-mini')
  ) {
    if (model.id === 'gpt-5-nano' || model.id === 'gpt-4.1-nano') {
      return { mode: 'patch', patchBudget: 1536, multiplier: 2.46, maxDimension: 2048 }
    }
    if (model.id === 'o4-mini') {
      return { mode: 'patch', patchBudget: 1536, multiplier: 1.72, maxDimension: 2048 }
    }
    return { mode: 'patch', patchBudget: 1536, multiplier: 1.62, maxDimension: 2048 }
  }
  return { mode: 'tile', baseTokens: 85, tileTokens: 170 }
}

export const estimateNativeImageTokens = async (model: LlmModel, imageBuffer: Buffer) => {
  const dimensions = await getImageDimensions(imageBuffer)

  switch (model.owned_by) {
    case 'openai':
      return estimateOpenAiImageTokens(model, dimensions)
    case 'anthropic':
      return estimateAnthropicImageTokens(dimensions)
    case 'google':
      return estimateGeminiImageTokens(dimensions)
    default:
      throw new Error(`No image token estimator configured for model owner "${model.owned_by}"`)
  }
}

export const estimateNativeImageTokensFromDimensions = (
  model: LlmModel,
  width: number,
  height: number
): number => {
  const dimensions = { width, height }
  switch (model.owned_by) {
    case 'openai':
      return estimateOpenAiImageTokens(model, dimensions)
    case 'anthropic':
      return estimateAnthropicImageTokens(dimensions)
    case 'google':
      return estimateGeminiImageTokens(dimensions)
    default:
      return 0
  }
}

export const estimateAnthropicImageTokens = ({ width, height }: ImageDimensions) => {
  const resized = resizeToAnthropicLimits(width, height)
  return Math.ceil((resized.width * resized.height) / 750)
}

export const estimateGeminiImageTokens = ({ width, height }: ImageDimensions) => {
  if (width <= 384 && height <= 384) {
    return 258
  }
  const cropUnit = Math.max(1, Math.floor(Math.min(width, height) / 1.5))
  const tilesAcross = Math.ceil(width / cropUnit)
  const tilesDown = Math.ceil(height / cropUnit)
  return tilesAcross * tilesDown * 258
}

export const estimateOpenAiImageTokens = (model: LlmModel, dimensions: ImageDimensions) => {
  const estimator = getOpenAiEstimator(model)
  if (estimator.mode === 'patch') {
    return estimateOpenAiPatchTokens(dimensions, estimator)
  }
  return estimateOpenAiTileTokens(dimensions, estimator)
}

const estimateOpenAiPatchTokens = (
  { width, height }: ImageDimensions,
  estimator: OpenAiPatchCost
) => {
  const originalPatchCount = Math.ceil(width / 32) * Math.ceil(height / 32)
  const resized =
    originalPatchCount <= estimator.patchBudget
      ? constrainMaxDimension({ width, height }, estimator.maxDimension)
      : resizeToPatchBudget({ width, height }, estimator.patchBudget, estimator.maxDimension)
  const resizedPatchCount = Math.ceil(resized.width / 32) * Math.ceil(resized.height / 32)
  return Math.ceil(resizedPatchCount * estimator.multiplier)
}

const estimateOpenAiTileTokens = (
  { width, height }: ImageDimensions,
  estimator: OpenAiTileCost
) => {
  const fit = constrainMaxDimension({ width, height }, 2048)
  const scaled = scaleShortestSideTo(fit, 768)
  const tiles = Math.ceil(scaled.width / 512) * Math.ceil(scaled.height / 512)
  return estimator.baseTokens + tiles * estimator.tileTokens
}

const constrainMaxDimension = ({ width, height }: ImageDimensions, maxDimension: number) => {
  const largest = Math.max(width, height)
  if (largest <= maxDimension) {
    return { width, height }
  }
  const scale = maxDimension / largest
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  }
}

const scaleShortestSideTo = ({ width, height }: ImageDimensions, target: number) => {
  const shortest = Math.min(width, height)
  if (shortest <= 0 || shortest === target) {
    return { width, height }
  }
  const scale = target / shortest
  return {
    width: Math.max(1, Math.floor(width * scale)),
    height: Math.max(1, Math.floor(height * scale)),
  }
}

const resizeToPatchBudget = (
  { width, height }: ImageDimensions,
  patchBudget: number,
  maxDimension: number
) => {
  const constrained = constrainMaxDimension({ width, height }, maxDimension)
  const shrinkFactor = Math.sqrt((32 ** 2 * patchBudget) / (constrained.width * constrained.height))
  const scaledWidth = constrained.width * shrinkFactor
  const scaledHeight = constrained.height * shrinkFactor
  const adjustedShrinkFactor =
    shrinkFactor *
    Math.min(
      Math.floor(scaledWidth / 32) / (scaledWidth / 32),
      Math.floor(scaledHeight / 32) / (scaledHeight / 32)
    )

  return {
    width: Math.max(1, Math.floor(constrained.width * adjustedShrinkFactor)),
    height: Math.max(1, Math.floor(constrained.height * adjustedShrinkFactor)),
  }
}

const resizeToAnthropicLimits = (width: number, height: number) => {
  let resized = constrainMaxDimension({ width, height }, 1568)
  const megapixels = resized.width * resized.height
  const maxMegapixels = 1_150_000
  if (megapixels <= maxMegapixels) {
    return resized
  }
  const scale = Math.sqrt(maxMegapixels / megapixels)
  resized = {
    width: Math.max(1, Math.floor(resized.width * scale)),
    height: Math.max(1, Math.floor(resized.height * scale)),
  }
  return resized
}
