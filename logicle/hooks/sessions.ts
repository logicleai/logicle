import * as dto from '@/types/dto'
import { useSWRJson } from './swr'
import { mutate } from 'swr'

export const useMySessions = () => {
  const url = `/api/auth/sessions`
  return useSWRJson<dto.SessionSummary[]>(url)
}

export const mutateMySessions = async () => {
  await mutate(`/api/auth/sessions`)
}
