import useSWR from 'swr'
import { useEffect } from 'react'
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
      return response.data as dto.SatelliteListItem[]
    }
  )

  useEffect(() => {
    let eventSource: EventSource | null = null

    try {
      eventSource = new EventSource('/api/me/satellites/events')
      eventSource.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data)
          if (data.type === 'satellite_connected' || data.type === 'satellite_disconnected') {
            void mutate()
          }
        } catch (err) {
          console.error('[useSatellites] Failed to parse event:', err)
        }
      })
      eventSource.addEventListener('error', () => {
        eventSource?.close()
      })
    } catch (err) {
      console.error('[useSatellites] Failed to connect:', err)
    }

    return () => {
      eventSource?.close()
    }
  }, [mutate])

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
