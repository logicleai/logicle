import * as dto from '@/types/dto'
import { db } from 'db/database'
import { nanoid } from 'nanoid'

export const createPrompt = async (ownerId: string, prompt: dto.InsertablePrompt) => {
  const id = nanoid()
  await db
    .insertInto('Prompt')
    .values({
      id,
      ownerId,
      ...prompt,
    })
    .executeTakeFirst()
  const created = await getPrompt(id)
  if (!created) {
    throw new Error('Creation failure')
  }
  return created
}

export const updatePrompt = async (promptId: dto.Prompt['id'], prompt: dto.InsertablePrompt) => {
  return await db.updateTable('Prompt').set(prompt).where('id', '=', promptId).executeTakeFirst()
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
