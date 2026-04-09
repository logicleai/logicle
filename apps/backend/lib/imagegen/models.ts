export const OPENAI_IMAGE_MODELS = ['dall-e-2', 'dall-e-3', 'gpt-image-1'] as const

export const GEMINI_IMAGE_MODELS = [
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-preview',
] as const

export const TOGETHER_IMAGE_MODELS = [
  'FLUX.1-schnell',
  'FLUX.1.1-pro',
  'FLUX.1-pro',
  'FLUX.1-kontext-pro',
  'FLUX.1-kontext-max',
] as const

export const IMAGEN_IMAGE_MODELS = [
  'imagen-4.0-generate-001',
  'imagen-4.0-ultra-generate-001',
  'imagen-4.0-fast-generate-001',
  'imagen-3.0-generate-002',
] as const

export type OpenAiImageModel = (typeof OPENAI_IMAGE_MODELS)[number]
export type GeminiImageModel = (typeof GEMINI_IMAGE_MODELS)[number]
export type TogetherImageModel = (typeof TOGETHER_IMAGE_MODELS)[number]
export type ImagenImageModel = (typeof IMAGEN_IMAGE_MODELS)[number]

export const IMAGE_EDITING_MODELS = [
  'gpt-image-1',
  'gemini-2.5-flash-image',
  'gemini-3-pro-image-preview',
  'FLUX.1-kontext-pro',
  'FLUX.1-kontext-max',
] as const

const OPENAI_IMAGE_MODEL_SET = new Set<string>(OPENAI_IMAGE_MODELS)
const GEMINI_IMAGE_MODEL_SET = new Set<string>(GEMINI_IMAGE_MODELS)
const TOGETHER_IMAGE_MODEL_SET = new Set<string>(TOGETHER_IMAGE_MODELS)
const IMAGEN_IMAGE_MODEL_SET = new Set<string>(IMAGEN_IMAGE_MODELS)
const IMAGE_EDITING_MODEL_SET = new Set<string>(IMAGE_EDITING_MODELS)

export const isImageEditingSupportedModel = (model: string) => IMAGE_EDITING_MODEL_SET.has(model)
export const isOpenAiImageModel = (model: string) => OPENAI_IMAGE_MODEL_SET.has(model)
export const isGeminiImageModel = (model: string) => GEMINI_IMAGE_MODEL_SET.has(model)
export const isTogetherImageModel = (model: string) => TOGETHER_IMAGE_MODEL_SET.has(model)
export const isImagenImageModel = (model: string) => IMAGEN_IMAGE_MODEL_SET.has(model)
