import { get } from '@/lib/fetch'
import * as dto from '@/types/dto'

export const getFileAnalysis = async (fileId: string) => {
  return await get<dto.FileAnalysis>(`/api/files/${fileId}/analysis`)
}
