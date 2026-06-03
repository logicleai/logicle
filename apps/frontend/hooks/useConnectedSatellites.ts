import { useEffect, useState } from 'react'

interface ConnectedSatellite {
  satelliteId: string
  satelliteName: string
}

export function useConnectedSatellites() {
  const [connectedSatellites, setConnectedSatellites] = useState<ConnectedSatellite[]>([])

  useEffect(() => {
    let eventSource: EventSource | null = null

    try {
      eventSource = new EventSource('/api/me/satellites/events')

      eventSource.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'snapshot') {
            // Replace entire state with snapshot
            setConnectedSatellites(data.satellites || [])
          } else if (data.type === 'satellite_connected') {
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
