'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'

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

interface SatelliteEventsContextType {
  discoverableSatellites: DiscoverableSatellite[]
  removeSatellite: (satelliteId: string) => void
}

const SatelliteEventsContext = createContext<SatelliteEventsContextType | null>(null)

export function SatelliteEventsProvider({ children }: { children: ReactNode }) {
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
          } else if (data.type === 'satellite_disconnected') {
            // Remove from discoverable list
            setDiscoverableSatellites((prev) =>
              prev.filter((s) => s.satelliteId !== data.satelliteId)
            )
          }
        } catch (err) {
          console.error('[SatelliteEventsProvider] Failed to parse event:', err)
        }
      })

      eventSource.addEventListener('error', () => {
        console.error('[SatelliteEventsProvider] Connection error')
        eventSource?.close()
      })
    } catch (err) {
      console.error('[SatelliteEventsProvider] Failed to connect:', err)
    }

    return () => {
      if (eventSource) {
        eventSource.close()
      }
    }
  }, [])

  const removeSatellite = (satelliteId: string) => {
    setDiscoverableSatellites((prev) => prev.filter((s) => s.satelliteId !== satelliteId))
  }

  return (
    <SatelliteEventsContext.Provider value={{ discoverableSatellites, removeSatellite }}>
      {children}
    </SatelliteEventsContext.Provider>
  )
}

export function useSatelliteDiscovery() {
  const context = useContext(SatelliteEventsContext)
  if (!context) {
    throw new Error('useSatelliteDiscovery must be used within SatelliteEventsProvider')
  }
  return {
    discoverableSatellites: context.discoverableSatellites,
    removeSatellite: context.removeSatellite,
    hasDiscoverableSatellites: context.discoverableSatellites.length > 0,
  }
}
