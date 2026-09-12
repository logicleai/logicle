import { promisify } from 'node:util'
import { execFile as execFileCallback } from 'node:child_process'
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { FileDbRow } from '@/backend/models/file'
import type * as dto from '@/types/dto'
import { storage } from '@/lib/storage'
import { logger } from '@/lib/logging'

const execFile = promisify(execFileCallback)

const DEFAULT_LANGUAGE = 'ita+eng'
const DEFAULT_DPI = 300
const MAX_PDF_PAGES = 100
const COMMAND_TIMEOUT_MS = 5 * 60 * 1000
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024

const tesseractCommand = () => process.env.TESSERACT_BIN ?? 'tesseract'
const pdfToPpmCommand = () => process.env.PDFTOPPM_BIN ?? 'pdftoppm'
const pdfInfoCommand = () => process.env.PDFINFO_BIN ?? 'pdfinfo'
const ocrLanguage = () => process.env.TESSERACT_LANG ?? DEFAULT_LANGUAGE

const run = async (command: string, args: string[]) =>
  execFile(command, args, {
    timeout: COMMAND_TIMEOUT_MS,
    maxBuffer: MAX_OUTPUT_BYTES,
    windowsHide: true,
  })

const runTesseract = async (imagePath: string): Promise<string> => {
  const { stdout } = await run(tesseractCommand(), [
    imagePath,
    'stdout',
    '--dpi',
    `${DEFAULT_DPI}`,
    '--psm',
    '3',
    '-l',
    ocrLanguage(),
  ])
  return stdout.trim()
}

const naturalPageOrder = (left: string, right: string) => {
  const leftPage = Number(left.match(/-(\d+)\.png$/)?.[1] ?? Number.MAX_SAFE_INTEGER)
  const rightPage = Number(right.match(/-(\d+)\.png$/)?.[1] ?? Number.MAX_SAFE_INTEGER)
  return leftPage - rightPage || left.localeCompare(right)
}

const renderPdfPages = async (pdfPath: string, outputPrefix: string): Promise<string[]> => {
  const { stdout } = await run(pdfInfoCommand(), [pdfPath])
  const pageCount = Number(stdout.match(/^Pages:\s+(\d+)/m)?.[1] ?? 0)
  if (pageCount > MAX_PDF_PAGES) {
    throw new Error(`OCR is limited to ${MAX_PDF_PAGES} PDF pages (document has ${pageCount})`)
  }

  await run(pdfToPpmCommand(), [
    '-r',
    `${DEFAULT_DPI}`,
    '-png',
    '-f',
    '1',
    ...(pageCount > 0 ? ['-l', `${pageCount}`] : []),
    pdfPath,
    outputPrefix,
  ])

  const directory = path.dirname(outputPrefix)
  const prefix = path.basename(outputPrefix)
  const files = (await readdir(directory))
    .filter((file) => file.startsWith(`${prefix}-`) && file.endsWith('.png'))
    .sort(naturalPageOrder)
  if (files.length === 0) throw new Error('PDF renderer produced no page images')
  return files.map((file) => path.join(directory, file))
}

const pageText = (pageNumber: number, text: string) =>
  [`[OCR page ${pageNumber}]`, text].filter((part) => part.length > 0).join('\n')

const extractPdf = async (data: Buffer, directory: string, fileName: string) => {
  const inputPath = path.join(directory, fileName)
  const outputPrefix = path.join(directory, 'page')
  await writeFile(inputPath, data)
  const pages = await renderPdfPages(inputPath, outputPrefix)
  const parts: string[] = []
  for (const [index, page] of pages.entries()) {
    const text = await runTesseract(page)
    if (text) parts.push(pageText(index + 1, text))
  }
  return parts.join('\n\n')
}

const extractImage = async (data: Buffer, directory: string, fileName: string) => {
  const inputPath = path.join(directory, fileName)
  await writeFile(inputPath, data)
  return runTesseract(inputPath)
}

export const isOcrCandidate = (
  file: Pick<FileDbRow, 'type'>,
  analysis: dto.FileAnalysis | undefined
): boolean => {
  if (file.type.startsWith('image/')) return true
  if (file.type !== 'application/pdf') return false
  if (analysis?.status !== 'ready') return true
  return analysis.payload?.kind === 'pdf' && analysis.payload.contentMode === 'scanned'
}

/**
 * Extracts searchable text locally for image files and scanned PDFs.
 *
 * This is intentionally a fallback after the normal file extractor. OCR text is useful for
 * retrieval, but the original file remains the authoritative source for answering exact questions.
 */
export const ocrExtractor = {
  extractFromFile: async (
    file: FileDbRow,
    analysis: dto.FileAnalysis | undefined
  ): Promise<string | undefined> => {
    if (!isOcrCandidate(file, analysis)) return undefined

    const directory = await mkdtemp(path.join(tmpdir(), 'logicle-ocr-'))
    try {
      const data = await storage.readBuffer(file.path, file.encryption)
      const text =
        file.type === 'application/pdf'
          ? await extractPdf(data, directory, 'document.pdf')
          : await extractImage(data, directory, 'document')
      return text.trim() || undefined
    } catch (error) {
      logger.warn('[text-extraction] OCR fallback failed', {
        fileId: file.id,
        fileName: file.name,
        fileType: file.type,
        error: error instanceof Error ? error.message : String(error),
      })
      return undefined
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  },
}
