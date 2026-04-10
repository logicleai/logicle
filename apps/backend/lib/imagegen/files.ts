const IMAGE_EXTENSION_BY_MIME_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export const normalizeGeneratedImageMimeType = (mimeType?: string) => {
  const normalized = mimeType?.split(';', 1)[0]?.trim().toLowerCase()
  if (!normalized || !(normalized in IMAGE_EXTENSION_BY_MIME_TYPE)) {
    return 'image/png'
  }
  return normalized
}

export const generatedImageExtensionForMimeType = (mimeType?: string) =>
  IMAGE_EXTENSION_BY_MIME_TYPE[normalizeGeneratedImageMimeType(mimeType)] ?? 'png'
