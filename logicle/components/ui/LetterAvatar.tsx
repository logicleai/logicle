'use client'

import { cn } from '@/lib/utils'
import { VariantProps, cva } from 'class-variance-authority'
import { FC } from 'react'

const variants = cva(
  'flex whitespace-nowrap items-center justify-center rounded-full bg-primary_color text-white',
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

interface Props extends VariantProps<typeof variants> {
  name: string
}

const LetterAvatar: FC<Props> = ({ name, size }: Props) => {
  const maxLength = 2
  const initials = name
    .split(' ')
    .map((word) => {
      return word.length > 0 ? word[0] : ''
    })
    .join('')
    .toUpperCase()
    .substring(0, maxLength)

  return <div className={cn(variants({ size }))}>{initials}</div>
}

export default LetterAvatar
