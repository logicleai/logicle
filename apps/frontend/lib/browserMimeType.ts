const knownExtensions: Record<string, string> = {
  '.py': 'text/x-python',
}

const extractExtension = (fileName: string) => {
  const parts = fileName.split('.')
  return parts.length >= 2 ? `.${parts[parts.length - 1]}` : null
}

export async function mimeTypeOfFile(fileName: string) {
  const extension = extractExtension(fileName)
  const knownType = extension ? knownExtensions[extension] : undefined
  if (knownType) return knownType

  // The mime database is about 190 KiB and is only needed for files whose
  // browser-provided type is empty. Keep it out of the initial chat bundle.
  const { lookup } = await import('mime-types')
  return lookup(fileName) || ''
}
