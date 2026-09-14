import * as mime from 'mime-types'

export { isMimeTypeAllowed, isValidMimeType } from './mimeTypeValidation'

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
