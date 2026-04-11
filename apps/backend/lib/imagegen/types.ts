export interface GeneratedImageData {
  b64_json: string
  mimeType?: string
}

export interface GeneratedImagesResponse {
  created: number
  data: GeneratedImageData[]
}

export interface ImageGenerationRequest {
  apiKey: string
  model: string
  prompt: string
  n?: number
  size?: string
  input?: Record<string, unknown>
}

export interface ImageEditInput {
  data: Buffer
  fileName: string
  mimeType: string
}

export interface ImageEditRequest extends ImageGenerationRequest {
  images: ImageEditInput[]
}
