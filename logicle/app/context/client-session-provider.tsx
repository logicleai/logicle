'use client'

import { Session } from 'next-auth'
import { SessionProvider } from 'next-auth/react'

export default function ClientSessionProvider({
  children,
  session,
}: {
  children: React.ReactNode
  session: Session | null
}): React.ReactNode {
  // There's a lot of stuff happening when refocusing. One of them is...
  // refresing the session.
  // If this is not wanted, add refetchOnWindowFocus={false} to SessionProvider
  return (
    <SessionProvider refetchInterval={0} refetchOnWindowFocus={false} session={session}>
      {children}
    </SessionProvider>
  )
}
