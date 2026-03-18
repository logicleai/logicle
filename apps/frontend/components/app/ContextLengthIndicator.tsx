'use client'

import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/frontend/lib/utils'

type Props = {
  current: number
  limit?: number
  pending?: boolean
  details: string[]
  className?: string
}

export const ContextLengthIndicator = ({
  current,
  limit,
  pending = false,
  details,
  className,
}: Props) => {
  const { t } = useTranslation()
  const safeCurrent = Math.max(0, current)
  const usageRatio = limit && limit > 0 ? Math.min(safeCurrent / limit, 1) : 0
  const percentage = limit && limit > 0 ? Math.round(usageRatio * 100) : 0
  const size = 26
  const strokeWidth = 4
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - usageRatio)

  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className={cn(
              'inline-flex items-center rounded-full p-0.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              pending ? 'opacity-70' : 'opacity-100',
              className
            )}
            aria-label={t('context_length')}
          >
            <span aria-hidden className="relative block h-[26px] w-[26px]">
              <svg
                viewBox={`0 0 ${size} ${size}`}
                className={cn('h-[26px] w-[26px] -rotate-90', pending ? 'animate-pulse' : '')}
              >
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke="rgb(63 63 70)"
                  strokeWidth={strokeWidth}
                  className="opacity-100"
                />
                <circle
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke="rgb(161 161 170)"
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                  className="transition-[stroke-dashoffset] duration-300"
                />
              </svg>
              <span className="absolute inset-0 flex items-center justify-center text-[7px] font-semibold leading-none text-zinc-900">
                {percentage}%
              </span>
            </span>
            <span className="sr-only">
              {t('context_length')}: {current.toLocaleString()}
              {limit !== undefined ? ` (${percentage}%)` : ''}
              {limit !== undefined ? ` / ${limit.toLocaleString()}` : ''}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-72 space-y-1.5 text-xs leading-5">
          <div className="font-medium">
            {t('context_length')}: {current.toLocaleString()}
            {limit !== undefined ? ` / ${limit.toLocaleString()}` : ''}
          </div>
          {details.map((detail) => (
            <div key={detail}>{detail}</div>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
