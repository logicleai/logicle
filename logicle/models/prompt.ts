import * as dto from '@/types/dto'
import { db } from 'db/database'
import { nanoid } from 'nanoid'

export const createPrompt = async (prompt: dto.InsertablePrompt) => {
  const id = nanoid()
  db.insertInto('Prompt')
    .values({
      ...prompt,
      id,
    })
    .executeTakeFirst()
  const created = await getPrompt(id)
  if (!created) {
    throw new Error('Creation failure')
  }
  return created
}

export const updatePrompt = async (promptId: dto.Prompt['id'], prompt: dto.Prompt) => {
  db.updateTable('Prompt').set(prompt).where('id', '=', promptId).executeTakeFirst()
}

export const getPrompt = async (promptId: dto.Prompt['id']) => {
  return await db.selectFrom('Prompt').selectAll().where('id', '=', promptId).executeTakeFirst()
}

export const getPrompts = async (ownerId: string) => {
  return await db.selectFrom('Prompt').selectAll().where('ownerId', '=', ownerId).execute()
}

export const deletePrompt = async (id: string) => {
  return await db
    .deleteFrom('Prompt')
    .where((eb) => eb.and([eb('id', '=', id)]))
    .executeTakeFirstOrThrow()
}
