'use client'

import { IconAlertTriangle } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/frontend/lib/utils'

export interface TokenRateLimitBannerProps {
  className?: string
}

export function TokenRateLimitBanner({ className }: TokenRateLimitBannerProps) {
  const { t } = useTranslation()

  return (
    <div
      className={cn('border-t border-amber-300/60 bg-amber-50 px-4 py-1.5 text-amber-800', className)}
      role="status"
    >
      <div className="mx-auto flex max-w-[var(--thread-content-max-width)] items-center gap-2">
        <IconAlertTriangle size={16} stroke={2} className="shrink-0" aria-hidden="true" />
        <p className="text-sm">{t('rate-limit-exceeded-warning')}</p>
      </div>
    </div>
  )
}
