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
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let retryDelay = 1000

    function connect() {
      try {
        eventSource = new EventSource('/api/me/satellites/events')
        eventSource.addEventListener('open', () => {
          retryDelay = 1000
        })
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
          eventSource = null
          retryTimer = setTimeout(() => {
            retryDelay = Math.min(retryDelay * 2, 30000)
            connect()
          }, retryDelay)
        })
      } catch (err) {
        console.error('[useSatellites] Failed to connect:', err)
      }
    }

    connect()

    return () => {
      if (retryTimer !== null) clearTimeout(retryTimer)
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
