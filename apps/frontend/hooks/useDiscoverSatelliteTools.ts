import { useEffect, useState, useCallback } from 'react'

export interface DiscoverableSatellite {
  satelliteId: string
  satelliteName: string
  tools: Array<{
    name: string
    description?: string
    inputSchema?: Record<string, any>
    outputSchema?: Record<string, any>
  }>
}

export function useDiscoverSatelliteTools() {
  const [discoverableSatellites, setDiscoverableSatellites] = useState<DiscoverableSatellite[]>([])

  useEffect(() => {
    let eventSource: EventSource | null = null

    try {
      eventSource = new EventSource('/api/me/satellites/events')

      eventSource.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.type === 'discoverable_snapshot') {
            // Replace entire state with snapshot
            setDiscoverableSatellites(data.satellites || [])
          } else if (data.type === 'satellite_connected' && data.tools && data.tools.length > 0) {
            setDiscoverableSatellites((prev) => {
              // Check if satellite already exists
              const existing = prev.findIndex((s) => s.satelliteId === data.satelliteId)
              const newSatellite: DiscoverableSatellite = {
                satelliteId: data.satelliteId,
                satelliteName: data.satelliteName,
                tools: data.tools,
              }

              if (existing >= 0) {
                // Update existing
                const updated = [...prev]
                updated[existing] = newSatellite
                return updated
              } else {
                // Add new
                return [...prev, newSatellite]
              }
            })
          }
        } catch (err) {
          console.error('[DiscoverSatelliteTools] Failed to parse event:', err)
        }
      })

      eventSource.addEventListener('error', () => {
        console.error('[DiscoverSatelliteTools] Connection error')
        eventSource?.close()
      })
    } catch (err) {
      console.error('[DiscoverSatelliteTools] Failed to connect:', err)
    }

    return () => {
      if (eventSource) {
        eventSource.close()
      }
    }
  }, [])

  const removeSatellite = useCallback((satelliteId: string) => {
    setDiscoverableSatellites((prev) => prev.filter((s) => s.satelliteId !== satelliteId))
  }, [])

  return {
    discoverableSatellites,
    removeSatellite,
    hasDiscoverableSatellites: discoverableSatellites.length > 0,
  }
}
