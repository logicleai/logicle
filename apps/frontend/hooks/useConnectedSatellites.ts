import { useEffect, useState } from 'react'
import { get } from '@/lib/fetch'

interface ConnectedSatellite {
  satelliteId: string
  satelliteName: string
}

export function useConnectedSatellites() {
  const [connectedSatellites, setConnectedSatellites] = useState<ConnectedSatellite[]>([])

  useEffect(() => {
    let eventSource: EventSource | null = null
    let cancelled = false

    void (async () => {
      try {
        const response = await get<ConnectedSatellite[]>('/api/me/satellites/connected')
        if (!cancelled && !response.error) {
          setConnectedSatellites(response.data ?? [])
        }
      } catch (err) {
        console.error('[ConnectedSatellites] Failed to load initial connections:', err)
      }
    })()

    try {
      eventSource = new EventSource('/api/me/satellites/events')

      eventSource.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'satellite_connected') {
            setConnectedSatellites((prev) => {
              const exists = prev.findIndex((s) => s.satelliteId === data.satelliteId)
              if (exists >= 0) {
                return prev // already connected
              }
              return [
                ...prev,
                {
                  satelliteId: data.satelliteId,
                  satelliteName: data.satelliteName,
                },
              ]
            })
          } else if (data.type === 'satellite_disconnected') {
            setConnectedSatellites((prev) =>
              prev.filter((s) => s.satelliteId !== data.satelliteId)
            )
          }
        } catch (err) {
          console.error('[ConnectedSatellites] Failed to parse event:', err)
        }
      })

      eventSource.addEventListener('error', () => {
        console.error('[ConnectedSatellites] Connection error')
        eventSource?.close()
      })
    } catch (err) {
      console.error('[ConnectedSatellites] Failed to connect:', err)
    }

    return () => {
      cancelled = true
      if (eventSource) {
        eventSource.close()
      }
    }
  }, [])

  return {
    connectedSatellites,
    hasConnectedSatellites: connectedSatellites.length > 0,
  }
}
