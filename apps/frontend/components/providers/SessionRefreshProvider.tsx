'use client'

import type { ReactNode } from 'react'
import { useEffect, useRef } from 'react'
import { useEnvironment } from '@/app/context/environmentProvider'

type Props = {
  children: ReactNode
}

async function refreshSession(): Promise<'ok' | 'expired' | 'error'> {
  try {
    const res = await fetch('/api/auth/refresh', {
      method: 'POST',
      credentials: 'same-origin',
    })
    return res.status === 401 ? 'expired' : 'ok'
  } catch {
    return 'error'
  }
}

// Every page but /auth/login and /auth/join requires a session (see the
// server-side auth gate in apps/backend/lib/staticFrontend.ts), so being
// mounted here at all — outside those two pages — means we were
// authenticated when this page loaded. A 401 from the periodic refresh
// below is therefore an unambiguous "the session died while this tab sat
// open" signal, not a routine pre-login 401 (this provider also mounts on
// the login/join pages themselves, since it lives in the root layout, and
// refresh always 401s there before the user submits credentials — that
// case must not redirect, or it'd fight the in-progress login form).
function isAuthPage() {
  return window.location.pathname.startsWith('/auth/')
}

function redirectToLogin() {
  const callbackUrl = encodeURIComponent(window.location.pathname + window.location.search)
  window.location.href = `/auth/login?callbackUrl=${callbackUrl}`
}

const SessionRefreshProvider = ({ children }: Props) => {
  const environment = useEnvironment()
  const lastAttemptRef = useRef(0)
  const inFlightRef = useRef(false)
  const refreshIntervalMs = environment.sessionRefreshIntervalMinutes * 60 * 1000
  const refreshThrottleMs = environment.sessionRefreshThrottleMinutes * 60 * 1000

  const tryRefresh = async () => {
    if (inFlightRef.current) return
    const now = Date.now()
    if (now - lastAttemptRef.current < refreshThrottleMs) return
    lastAttemptRef.current = now
    inFlightRef.current = true
    try {
      const result = await refreshSession()
      if (result === 'expired' && !isAuthPage()) {
        redirectToLogin()
      }
    } finally {
      inFlightRef.current = false
    }
  }

  useEffect(() => {
    // Environment hasn't loaded yet (see EnvironmentProvider's
    // DEFAULT_ENVIRONMENT) — wait for the real values rather than
    // scheduling a 0ms interval.
    if (refreshIntervalMs <= 0) return

    void tryRefresh()

    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void tryRefresh()
      }
    }, refreshIntervalMs)

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
  }, [refreshIntervalMs, refreshThrottleMs])

  return children
}

export default SessionRefreshProvider
