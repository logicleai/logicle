import { db } from 'db/database'

export interface CompressedMessageRecord {
  sourceMessageId: string
  compressionVersion: number
  content: unknown
  version: number | null
  createdAt: string
  updatedAt: string
}

export const getCompressedMessage = async (
  sourceMessageId: string,
  compressionVersion: number
): Promise<CompressedMessageRecord | undefined> => {
  const row = await db
    .selectFrom('CompressedMessage')
    .selectAll()
    .where('sourceMessageId', '=', sourceMessageId)
    .where('compressionVersion', '=', compressionVersion)
    .executeTakeFirst()
  if (!row) return undefined
  return { ...row, content: JSON.parse(row.content) as unknown }
}

export const saveCompressedMessage = async (params: {
  sourceMessageId: string
  compressionVersion: number
  content: unknown
  version: number | null
}): Promise<void> => {
  const now = new Date().toISOString()
  const content = JSON.stringify(params.content)
  await db
    .insertInto('CompressedMessage')
    .values({
      sourceMessageId: params.sourceMessageId,
      compressionVersion: params.compressionVersion,
      content,
      version: params.version,
      createdAt: now,
      updatedAt: now,
    })
    .onConflict((oc) =>
      oc.columns(['sourceMessageId', 'compressionVersion']).doUpdateSet({
        content,
        version: params.version,
        updatedAt: now,
      })
    )
    .execute()
}
