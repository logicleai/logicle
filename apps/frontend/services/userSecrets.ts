import { delete_, get, post } from '@/lib/fetch'
import * as dto from '@/types/dto'

export const getUserSecretStatuses = async () => {
  return await get<dto.UserSecretStatus[]>(`/api/me/secrets`)
}

export const createUserSecret = async (payload: dto.InsertableUserSecret) => {
  return await post<dto.UserSecretStatus>(`/api/me/secrets`, payload)
}

export const deleteUserSecret = async (id: string) => {
  return await delete_<void>(`/api/me/secrets/${id}`)
}
