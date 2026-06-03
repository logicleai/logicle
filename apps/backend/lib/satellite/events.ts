import { logger } from '@/lib/logging'
import { PublishedCapability, Tool } from './types'

export interface SatelliteEvent {
  type: 'capabilities_available' | 'satellite_connected' | 'satellite_disconnected'
  userId: string
  satelliteId: string
  satelliteName?: string
  tools?: Tool[]
  capabilities?: PublishedCapability[]
  timestamp: string
}

type EventListener = (event: SatelliteEvent) => void

export class SatelliteEventBus {
  private listeners: Map<string, Set<EventListener>> = new Map()

  subscribe(userId: string, listener: EventListener): () => void {
    if (!this.listeners.has(userId)) {
      this.listeners.set(userId, new Set())
    }
    this.listeners.get(userId)!.add(listener)

    // Return unsubscribe function
    return () => {
      this.listeners.get(userId)?.delete(listener)
      if (this.listeners.get(userId)?.size === 0) {
        this.listeners.delete(userId)
      }
    }
  }

  publish(event: SatelliteEvent): void {
    const listeners = this.listeners.get(event.userId)
    if (listeners) {
      logger.debug(`[SatelliteEventBus] Publishing event to ${listeners.size} listeners: ${event.type}`)
      listeners.forEach((listener) => {
        try {
          listener(event)
        } catch (err) {
          logger.error('[SatelliteEventBus] Error calling listener:', err)
        }
      })
    }
  }

  getListenerCount(userId: string): number {
    return this.listeners.get(userId)?.size ?? 0
  }
}

export const satelliteEventBus = new SatelliteEventBus()
