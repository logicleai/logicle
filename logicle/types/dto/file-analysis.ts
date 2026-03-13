import { z } from 'zod'

export const fileAnalysisKindValues = [
  'pdf',
  'image',
  'spreadsheet',
  'presentation',
  'word',
  'unknown',
] as const
export const fileAnalysisKindSchema = z.enum(fileAnalysisKindValues)
export type FileAnalysisKind = z.infer<typeof fileAnalysisKindSchema>

export const fileAnalysisStatusValues = ['ready', 'failed', 'unavailable'] as const
export const fileAnalysisStatusSchema = z.enum(fileAnalysisStatusValues)
export type FileAnalysisStatus = z.infer<typeof fileAnalysisStatusSchema>

export const unknownFileAnalysisPayloadSchema = z.object({
  kind: z.literal('unknown'),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
})

export const pdfFileAnalysisPayloadSchema = z.object({
  kind: z.literal('pdf'),
  mimeType: z.literal('application/pdf'),
  sizeBytes: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative(),
  textCharCount: z.number().int().nonnegative(),
  hasExtractableText: z.boolean(),
  imagePageCount: z.number().int().nonnegative(),
  contentMode: z.enum(['text', 'mixed', 'scanned']),
})

export const imageFileAnalysisPayloadSchema = z.object({
  kind: z.literal('image'),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  frameCount: z.number().int().positive(),
  hasAlpha: z.boolean(),
  format: z.string().nullable(),
})

export const spreadsheetFileAnalysisPayloadSchema = z.object({
  kind: z.literal('spreadsheet'),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  sheetCount: z.number().int().nonnegative(),
  textCharCount: z.number().int().nonnegative(),
  hasExtractableText: z.boolean(),
})

export const presentationFileAnalysisPayloadSchema = z.object({
  kind: z.literal('presentation'),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  slideCount: z.number().int().nonnegative(),
  textCharCount: z.number().int().nonnegative(),
  hasExtractableText: z.boolean(),
})

export const wordFileAnalysisPayloadSchema = z.object({
  kind: z.literal('word'),
  mimeType: z.string(),
  sizeBytes: z.number().int().nonnegative(),
  textCharCount: z.number().int().nonnegative(),
  hasExtractableText: z.boolean(),
})

export const fileAnalysisPayloadSchema = z.discriminatedUnion('kind', [
  unknownFileAnalysisPayloadSchema,
  pdfFileAnalysisPayloadSchema,
  imageFileAnalysisPayloadSchema,
  spreadsheetFileAnalysisPayloadSchema,
  presentationFileAnalysisPayloadSchema,
  wordFileAnalysisPayloadSchema,
])

export const fileAnalysisSchema = z.object({
  fileId: z.string(),
  kind: fileAnalysisKindSchema,
  status: fileAnalysisStatusSchema,
  analyzerVersion: z.number().int().nonnegative(),
  payload: fileAnalysisPayloadSchema.nullable(),
  error: z.string().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type FileAnalysisPayload = z.infer<typeof fileAnalysisPayloadSchema>
export type FileAnalysis = z.infer<typeof fileAnalysisSchema>
