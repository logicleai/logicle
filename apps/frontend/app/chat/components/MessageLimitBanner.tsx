'use client'

import { IconAlertTriangle, IconBan } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/frontend/lib/utils'

export interface MessageLimitBannerProps {
  variant: 'warning' | 'block'
  count?: number
  className?: string
}

export function MessageLimitBanner({ variant, count, className }: MessageLimitBannerProps) {
  const { t } = useTranslation()
  const isBlock = variant === 'block'

  return (
    <output
      className={cn(
        'block border-t px-4 py-1.5',
        isBlock
          ? 'border-destructive/40 bg-destructive/10 text-destructive'
          : 'border-amber-300/60 bg-amber-50 text-amber-800',
        className
      )}
    >
      <div className="mx-auto flex max-w-[var(--thread-content-max-width)] items-center gap-2">
        {isBlock ? (
          <IconBan size={16} stroke={2} className="shrink-0" aria-hidden="true" />
        ) : (
          <IconAlertTriangle size={16} stroke={2} className="shrink-0" aria-hidden="true" />
        )}
        <p className="text-sm">
          {t(isBlock ? 'chat-hard-message-limit-reached' : 'chat-soft-message-limit-warning', { count })}
        </p>
      </div>
    </output>
  )
}
