import { useEffect, useCallback } from 'react'
import toast from 'react-hot-toast'

interface SatelliteEventMessage {
  type: 'connected' | 'capabilities_available' | 'satellite_connected' | 'satellite_disconnected'
  userId?: string
  satelliteId?: string
  satelliteName?: string
  capabilities?: Array<{
    type: 'mcp_tool' | 'llm_model'
    name: string
    description: string
  }>
  timestamp?: string
}

export function useSatelliteEvents() {
  const handleCapabilitiesAvailable = useCallback(
    (event: SatelliteEventMessage) => {
      if (!event.capabilities || event.capabilities.length === 0) return

      const capabilityNames = event.capabilities.map((c) => c.name).join(', ')
      const message =
        event.capabilities.length === 1
          ? `${event.satelliteName} pubblica: ${capabilityNames}`
          : `${event.satelliteName} pubblica ${event.capabilities.length} capabilities`

      toast.success(message, {
        duration: 5000,
        icon: '🛰️',
      })
    },
    []
  )

  const handleSatelliteConnected = useCallback((event: SatelliteEventMessage) => {
    toast.success(`${event.satelliteName} connesso`, {
      duration: 3000,
      icon: '✅',
    })
  }, [])

  const handleSatelliteDisconnected = useCallback((event: SatelliteEventMessage) => {
    toast.error(`${event.satelliteName} disconnesso\nI tool rimangono ma non funzionano`, {
      duration: 4000,
      icon: '⚠️',
    })
  }, [])

  useEffect(() => {
    let eventSource: EventSource | null = null

    try {
      eventSource = new EventSource('/api/me/satellites/events')

      eventSource.addEventListener('message', (event) => {
        try {
          const data = JSON.parse(event.data) as SatelliteEventMessage

          if (data.type === 'connected') {
            console.log('[SatelliteEvents] Connected to event stream')
          } else if (data.type === 'capabilities_available') {
            handleCapabilitiesAvailable(data)
          } else if (data.type === 'satellite_connected') {
            handleSatelliteConnected(data)
          } else if (data.type === 'satellite_disconnected') {
            handleSatelliteDisconnected(data)
          }
        } catch (err) {
          console.error('[SatelliteEvents] Failed to parse event:', err)
        }
      })

      eventSource.addEventListener('error', () => {
        console.error('[SatelliteEvents] Connection error')
        eventSource?.close()
      })
    } catch (err) {
      console.error('[SatelliteEvents] Failed to connect:', err)
    }

    return () => {
      if (eventSource) {
        eventSource.close()
      }
    }
  }, [handleCapabilitiesAvailable, handleSatelliteConnected, handleSatelliteDisconnected])
}
