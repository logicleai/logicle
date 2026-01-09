'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'

const REFRESH_INTERVAL_MS = 30 * 60 * 1000
const REFRESH_THROTTLE_MS = 30 * 1000

type Props = {
  children: ReactNode
}

async function refreshSession() {
  await fetch('/api/auth/refresh', {
    method: 'POST',
    credentials: 'same-origin',
  })
}

const SessionRefreshProvider = ({ children }: Props) => {
  const lastAttemptRef = useRef(0)
  const inFlightRef = useRef(false)

  const tryRefresh = async () => {
    if (inFlightRef.current) return
    const now = Date.now()
    if (now - lastAttemptRef.current < REFRESH_THROTTLE_MS) return
    lastAttemptRef.current = now
    inFlightRef.current = true
    try {
      await refreshSession()
    } catch {
      // Ignore refresh errors; next interval or focus will retry.
    } finally {
      inFlightRef.current = false
    }
  }

  useEffect(() => {
    void tryRefresh()

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void tryRefresh()
      }
    }, REFRESH_INTERVAL_MS)

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        void tryRefresh()
      }
    }
    window.addEventListener('focus', onVisible)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('focus', onVisible)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  return children
}

export default SessionRefreshProvider
