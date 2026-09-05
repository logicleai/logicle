import sharp from 'sharp'

import type { ImageEditInput } from './types'

const IMAGE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

const EDITABLE_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export const normalizeGeneratedImageMimeType = (mimeType?: string) => {
  const normalized = mimeType?.split(';', 1)[0]?.trim().toLowerCase()
  if (!normalized || !(normalized in IMAGE_EXTENSION_BY_MIME_TYPE)) {
    return 'image/png'
  }
  return normalized
}

export const generatedImageExtensionForMimeType = (mimeType?: string) =>
  IMAGE_EXTENSION_BY_MIME_TYPE[normalizeGeneratedImageMimeType(mimeType)] ?? 'png'

const normalizeSourceImageMimeType = (mimeType: string) => {
  const normalized = mimeType.split(';', 1)[0]?.trim().toLowerCase()
  return normalized === 'image/jpg' ? 'image/jpeg' : normalized
}

const pngFileName = (fileName: string) => {
  const withoutExtension = fileName.replace(/\.[^./]+$/, '') || 'upload'
  return `${withoutExtension}.png`
}

/**
 * Normalize an image before sending it to an image-edit provider.
 *
 * The providers accept PNG/JPEG/WebP, while the upload UI intentionally accepts
 * any image/* MIME type. Converting the other image formats here keeps provider
 * requests identical for filesystem- and S3-backed tenants and prevents a
 * provider from receiving a misleading MIME type (for example image/gif data
 * labelled as image/png).
 */
export const prepareImageForEditing = async (image: ImageEditInput): Promise<ImageEditInput> => {
  const mimeType = normalizeSourceImageMimeType(image.mimeType)
  if (EDITABLE_IMAGE_MIME_TYPES.has(mimeType)) {
    return { ...image, mimeType }
  }

  if (!mimeType.startsWith('image/')) {
    throw new Error(`Image editing requires an image file, received ${image.mimeType}`)
  }

  try {
    const data = await sharp(image.data).png().toBuffer()
    return {
      ...image,
      data,
      fileName: pngFileName(image.fileName),
      mimeType: 'image/png',
    }
  } catch (error) {
    throw new Error(`Unable to convert ${image.fileName} to a supported image format`, {
      cause: error,
    })
  }
}
