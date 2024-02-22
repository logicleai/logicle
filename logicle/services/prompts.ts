import { InsertablePrompt, Prompt } from '@/types/db'
import { delete_, post, put } from '@/lib/fetch'

export const createPrompt = async (prompt: InsertablePrompt) => {
  return await post(`/api/user/prompts`, prompt)
}

export const updatePrompt = async (prompt: Prompt) => {
  return await put(`/api/user/prompts/${prompt.id}`, prompt)
}

export const deletePrompt = async (promptId: Prompt['id']) => {
  return await delete_(`/api/user/prompts/${promptId}`)
}
