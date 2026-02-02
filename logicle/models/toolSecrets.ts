import { db } from 'db/database'
import * as schema from '@/db/schema'
import { nanoid } from 'nanoid'

export const getToolSecretValue = async (
  toolId: string,
  key: string
): Promise<{ status: 'ok'; value: string } | { status: 'missing' }> => {
  const secret = await db
    .selectFrom('ToolSecret')
    .select(['value'])
    .where('toolId', '=', toolId)
    .where('key', '=', key)
    .executeTakeFirst()
  if (!secret) return { status: 'missing' }
  return { status: 'ok', value: secret.value }
}

export const upsertToolSecret = async (toolId: string, key: string, value: string) => {
  const now = new Date().toISOString()
  const existing = await db
    .selectFrom('ToolSecret')
    .select(['id'])
    .where('toolId', '=', toolId)
    .where('key', '=', key)
    .executeTakeFirst()
  if (existing) {
    await db
      .updateTable('ToolSecret')
      .set({ value, updatedAt: now })
      .where('id', '=', existing.id)
      .execute()
    return
  }
  const record: schema.ToolSecret = {
    id: nanoid(),
    toolId,
    key,
    value,
    createdAt: now,
    updatedAt: now,
  }
  await db.insertInto('ToolSecret').values(record).execute()
}
