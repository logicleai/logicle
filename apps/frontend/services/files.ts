import { get } from '@/lib/fetch'
import * as dto from '@/types/dto'

export const getFileAnalysis = async (fileId: string, modelId?: string) => {
  const params = modelId ? `?modelId=${encodeURIComponent(modelId)}` : ''
  return await get<dto.FileAnalysis>(`/api/files/${fileId}/analysis${params}`)
}

export interface UserImage {
  id: string
  name: string
  type: string
  size: number
  createdAt: string
}

export const getUserImages = async () => {
  return await get<UserImage[]>(`/api/files/images`)
}
