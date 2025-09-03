import { findExtractor } from '@/lib/textextraction'
import { readFileSync } from 'node:fs'
import { lookup } from 'mime-types'

async function main() {
  const filePath = process.argv[2]
  if (!filePath) {
    console.error('Usage: ts-node src/index.ts <path-to-pdf>')
    process.exit(1)
  }

  const mimeType = lookup(filePath) // returns "application/pdf" | false

  if (mimeType) {
    console.log('MIME type:', mimeType)
  } else {
    console.log('Could not determine MIME type')
    process.exit(-1)
  }
  try {
    const buffer = readFileSync(filePath)
    const extractor = findExtractor(mimeType)
    if (!extractor) {
      console.log(`No extractor for MIME type ${mimeType}`)
      process.exit(-1)
    }
    const text = await extractor(buffer)
    process.stdout.write(text)
  } catch (err) {
    console.error('Error extracting text:', err)
    process.exit(1)
  }
}

main()
