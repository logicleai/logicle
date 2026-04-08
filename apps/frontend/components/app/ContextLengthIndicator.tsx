'use client'

import { useTranslation } from 'react-i18next'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/frontend/lib/utils'
import * as dto from '@/types/dto'

type Props = {
  current: number
  limit?: number
  pending?: boolean
  details: string[]
  tokenDetail?: dto.TokenEstimateDetail
  className?: string
}

const labelForPart = (part: dto.TokenDetailPart): string => {
  switch (part.type) {
    case 'system_prompt':
      return 'System prompt'
    case 'knowledge_text':
      return 'Knowledge (text)'
    case 'knowledge_file':
      return part.name ?? part.id ?? 'Knowledge file'
    default:
      return part.type
  }
}

export const ContextLengthIndicator = ({
  current,
  limit,
  pending = false,
  details,
  tokenDetail,
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

  const preambleParts = tokenDetail?.preamble ?? []
  const preambleTotal = preambleParts.reduce((sum, p) => sum + p.tokens, 0)

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
          {preambleParts.length > 0 && (
            <div className="mt-2 space-y-1 border-t border-zinc-700 pt-2">
              {preambleParts.map((part, i) => {
                const pct = preambleTotal > 0 ? (part.tokens / preambleTotal) * 100 : 0
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate text-zinc-300">
                      {labelForPart(part)}
                    </span>
                    <div className="w-14 shrink-0 overflow-hidden rounded-full bg-zinc-700">
                      <div
                        className="h-1 rounded-full bg-zinc-400 transition-[width] duration-300"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="w-14 shrink-0 text-right tabular-nums text-zinc-400">
                      {part.tokens.toLocaleString()}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
