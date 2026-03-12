import { db } from 'db/database'
import * as schema from '@/db/schema'
import * as dto from '@/types/dto'
import { inferFileAnalysisKind as inferFileAnalysisKindFromMime } from '@/lib/file-analysis/extractors'

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
  return inferFileAnalysisKindFromMime(mimeType)
}

export const getFileAnalysis = async (fileId: string): Promise<dto.FileAnalysis | undefined> => {
  const entry = await db.selectFrom('FileAnalysis').selectAll().where('fileId', '=', fileId).executeTakeFirst()
  return entry ? dbFileAnalysisToDto(entry) : undefined
}

export const upsertPendingFileAnalysis = async (
  fileId: string,
  kind: dto.FileAnalysisKind
): Promise<void> => {
  const timestamp = now()
  await db
    .insertInto('FileAnalysis')
    .values({
      fileId,
      kind,
      status: 'pending',
      analyzerVersion: null,
      payload: null,
      error: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .onConflict((oc) =>
      oc.column('fileId').doUpdateSet({
        kind,
        status: 'pending',
        analyzerVersion: null,
        payload: null,
        error: null,
        updatedAt: timestamp,
      })
    )
    .executeTakeFirst()
}

export const markFileAnalysisProcessing = async (
  fileId: string,
  analyzerVersion: string
): Promise<void> => {
  await db
    .updateTable('FileAnalysis')
    .set({
      status: 'processing',
      analyzerVersion,
      error: null,
      updatedAt: now(),
    })
    .where('fileId', '=', fileId)
    .execute()
}

export const completeFileAnalysis = async (
  fileId: string,
  payload: dto.FileAnalysisPayload,
  analyzerVersion: string
): Promise<void> => {
  await db
    .updateTable('FileAnalysis')
    .set({
      kind: payload.kind,
      status: 'ready',
      analyzerVersion,
      payload: JSON.stringify(payload),
      error: null,
      updatedAt: now(),
    })
    .where('fileId', '=', fileId)
    .execute()
}

export const failFileAnalysis = async (fileId: string, error: string): Promise<void> => {
  await db
    .updateTable('FileAnalysis')
    .set({
      status: 'failed',
      error,
      updatedAt: now(),
    })
    .where('fileId', '=', fileId)
    .execute()
}

export const listRecoverableFileAnalysisFileIds = async (limit: number): Promise<string[]> => {
  const rows = await db
    .selectFrom('File')
    .leftJoin('FileAnalysis', 'FileAnalysis.fileId', 'File.id')
    .select(['File.id as id'])
    .where('File.uploaded', '=', 1)
    .where((eb) =>
      eb.or([
        eb('FileAnalysis.fileId', 'is', null),
        eb('FileAnalysis.status', '=', 'pending'),
        eb('FileAnalysis.status', '=', 'processing'),
      ])
    )
    .limit(limit)
    .execute()

  return rows.map((row) => row.id)
}
