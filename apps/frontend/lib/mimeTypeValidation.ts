export function isMimeTypeAllowed(mimeType: string, allowedTypes: string[]): boolean {
  if (!isValidMimeType(mimeType)) {
    console.error(`Invalid MIME type provided: "${mimeType}"`)
    return false
  }

  const [targetType, targetSubType] = mimeType.split('/').map((s) => s.trim())
  for (const allowed of allowedTypes) {
    const parts = allowed.split('/')
    if (parts.length !== 2) {
      console.warn(`Skipping invalid allowed MIME type pattern: "${allowed}"`)
      continue
    }
    const [allowedType, allowedSubType] = parts.map((s) => s.trim())
    if (
      (allowedType === '*' || allowedType === targetType) &&
      (allowedSubType === '*' || allowedSubType === targetSubType)
    ) {
      return true
    }
  }
  return false
}

export function isValidMimeType(mimeType: string) {
  const parts = mimeType.split('/')
  return parts.length === 2 && parts[0].trim() !== '' && parts[1].trim() !== ''
}
