import { db } from 'db/database'
import * as schema from '@/db/schema'
import * as dto from '@/types/dto'

type DbFileAnalysis = schema.FileAnalysis

const now = () => new Date().toISOString()

const parsePayload = (payload: string | null): dto.FileAnalysisPayload | null => {
  if (!payload) {
    return null
  }
  return dto.fileAnalysisPayloadSchema.parse(JSON.parse(payload))
}

const dbFileAnalysisToDto = (entry: DbFileAnalysis): dto.FileAnalysis => {
  return {
    fileId: entry.fileId,
    kind: dto.fileAnalysisKindSchema.parse(entry.kind),
    status: dto.fileAnalysisStatusSchema.parse(entry.status),
    analyzerVersion: entry.analyzerVersion,
    payload: parsePayload(entry.payload),
    error: entry.error,
    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,
  }
}

export const inferFileAnalysisKind = (mimeType: string): dto.FileAnalysisKind => {
  if (mimeType === 'application/pdf') return 'pdf'
  if (mimeType.startsWith('image/')) return 'image'
  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel'
  )
    return 'spreadsheet'
  if (mimeType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
    return 'presentation'
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    return 'word'
  return 'unknown'
}

export const getFileAnalysis = async (fileId: string): Promise<dto.FileAnalysis | undefined> => {
  const entry = await db.selectFrom('FileAnalysis').selectAll().where('fileId', '=', fileId).executeTakeFirst()
  return entry ? dbFileAnalysisToDto(entry) : undefined
}

export const completeFileAnalysis = async (
  fileId: string,
  payload: dto.FileAnalysisPayload,
  analyzerVersion: string
): Promise<void> => {
  const timestamp = now()
  await db
    .insertInto('FileAnalysis')
    .values({
      fileId,
      kind: payload.kind,
      status: 'ready',
      analyzerVersion,
      payload: JSON.stringify(payload),
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflict((oc) =>
      oc.column('fileId').doUpdateSet({
        kind: payload.kind,
        status: 'ready',
        analyzerVersion,
        payload: JSON.stringify(payload),
        error: null,
        updatedAt: timestamp,
      })
    )
    .execute()
}

export const failFileAnalysis = async (
  fileId: string,
  kind: dto.FileAnalysisKind,
  error: string
): Promise<void> => {
  const timestamp = now()
  await db
    .insertInto('FileAnalysis')
    .values({
      fileId,
      kind,
      status: 'failed',
      analyzerVersion: null,
      payload: null,
      error,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflict((oc) =>
      oc.column('fileId').doUpdateSet({
        status: 'failed',
        error,
        updatedAt: timestamp,
      })
    )
    .execute()
}
