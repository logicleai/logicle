import useSWR from 'swr'
import { get } from '@/lib/fetch'
import * as dto from '@/types/dto'

export function useSatellites() {
  const { data, error, isLoading, mutate } = useSWR(
    '/api/me/satellites',
    async (url) => {
      const response = await get(url)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data as dto.Satellite[]
    }
  )

  return {
    data: data || [],
    error: error?.message || null,
    isLoading,
    mutate,
  }
}

export function useSatellite(id: string) {
  const { data, error, isLoading, mutate } = useSWR(
    id ? `/api/me/satellites/${id}` : null,
    async (url) => {
      const response = await get(url)
      if (response.error) {
        throw new Error(response.error.message)
      }
      return response.data as dto.Satellite
    }
  )

  return {
    data,
    error: error?.message || null,
    isLoading,
    mutate,
  }
}
