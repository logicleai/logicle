import * as dto from '@/types/dto'
import { delete_, post, put } from '@/lib/fetch'

export const createPrompt = async (prompt: dto.InsertablePrompt) => {
  return await post(`/api/user/prompts`, prompt)
}

export const updatePrompt = async (prompt: dto.Prompt) => {
  return await put(`/api/user/prompts/${prompt.id}`, prompt)
}

export const deletePrompt = async (promptId: dto.Prompt['id']) => {
  return await delete_(`/api/user/prompts/${promptId}`)
}
