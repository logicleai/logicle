'use client'

import { cn } from '@/lib/utils'
import { VariantProps, cva } from 'class-variance-authority'
import { FC } from 'react'

const variants = cva(
  'flex whitespace-nowrap items-center justify-center rounded-full bg-primary text-primary-foreground',
  {
    variants: {
      size: {
        default: 'w-8 h-8 text-sm',
        fillParent: 'w-full h-full',
      },
    },
    defaultVariants: {
      size: 'default',
    },
  }
)

export function stringToHslColor_(str: string, saturation: number, luminance: number) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const h = hash % 360
  return 'hsl(' + h + ', ' + saturation + '%, ' + luminance + '%)'
}

export function stringToHslColor(str: string) {
  return stringToHslColor_(str, 100, 40)
}

interface Props extends VariantProps<typeof variants> {
  name: string
  fill?: string
  border?: string
  color?: string
}

const LetterAvatar: FC<Props> = ({ name, size, fill, color, border }: Props) => {
  const maxLength = 2
  const initials = name
    .split(' ')
    .map((word) => {
      return word.length > 0 ? word[0] : ''
    })
    .join('')
    .toUpperCase()
    .substring(0, maxLength)
  const backgroundColor = fill ?? stringToHslColor(name)

  return (
    <div
      style={{ backgroundColor: backgroundColor, border: border, color: color }}
      className={cn(variants({ size }))}
    >
      {initials}
    </div>
  )
}

export default LetterAvatar
