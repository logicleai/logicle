import * as mime from 'mime-types'

export const knownExtensions = {
  '.py': 'text/x-python',
}

export function extractExtension(fileName: string) {
  const parts = fileName.split('.')
  if (parts.length >= 2) {
    return `.${parts.slice(-1)}`
  }
  return null
}

export function mimeTypeOfFile(fileName: string) {
  const extension = extractExtension(fileName)
  if (extension) {
    const fileType = knownExtensions[extension]
    if (fileType) return fileType
  }
  const lookup = mime.lookup(fileName)
  if (lookup) {
    return lookup
  }
  return ''
}

export function isValidMimeType(mime: string): boolean {
  // A simple validation: exactly one "/" and non-empty type and subtype.
  const parts = mime.split('/')
  return parts.length === 2 && parts[0].trim() !== '' && parts[1].trim() !== ''
}

export function isMimeTypeAllowed(mimeType: string, allowedTypes: string[]): boolean {
  // Validate the candidate MIME type.
  if (!isValidMimeType(mimeType)) {
    console.error(`Invalid MIME type provided: "${mimeType}"`)
    return false
  }

  // Split the candidate MIME type into its type and subtype parts.
  const [targetType, targetSubType] = mimeType.split('/').map((s) => s.trim())

  // Iterate through each allowed MIME type in the list.
  for (const allowed of allowedTypes) {
    // For allowed patterns, we allow wildcards. Here, basic validation is optional.
    const parts = allowed.split('/')
    if (parts.length !== 2) {
      console.warn(`Skipping invalid allowed MIME type pattern: "${allowed}"`)
      continue
    }
    const [allowedType, allowedSubType] = parts.map((s) => s.trim())

    // A match is found if:
    //   - allowed type is '*' or equals the candidate type
    //   - allowed subtype is '*' or equals the candidate subtype
    if (
      (allowedType === '*' || allowedType === targetType) &&
      (allowedSubType === '*' || allowedSubType === targetSubType)
    ) {
      return true
    }
  }

  // If no matches were found, return false.
  return false
}
