import * as React from 'react'

import { Input } from '@/components/ui/input'

type NumberInputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'type' | 'value' | 'defaultValue' | 'onChange'
> & {
  value?: number | string
  defaultValue?: number | string
  mode?: 'integer' | 'float'
  onChange?: (value: number | '') => void
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ mode = 'float', onChange, value, defaultValue, ...props }, ref) => {
    const parseValue = (nextValue: string) => {
      if (nextValue === '') return ''
      const parsed =
        mode === 'integer' ? Number.parseInt(nextValue, 10) : Number.parseFloat(nextValue)
      return Number.isNaN(parsed) ? '' : parsed
    }

    return (
      <Input
        {...props}
        ref={ref}
        type="number"
        value={value ?? ''}
        defaultValue={defaultValue}
        onChange={(event) => {
          onChange?.(parseValue(event.target.value))
        }}
      />
    )
  }
)

NumberInput.displayName = 'NumberInput'
