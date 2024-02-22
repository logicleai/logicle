'use client'

import { initi18n } from './client'

initi18n()

export default function ClientI18nProvider({
  children,
}: {
  children: React.ReactNode
}): React.ReactNode {
  return <>{children}</>
}
