import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { IconX } from '@tabler/icons-react'

interface Props {
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
  placeholder?: string
  className?: string
}

const TagInput = ({ value, onChange, disabled = false, placeholder, className }: Props) => {
  const [inputValue, setInputValue] = useState('')

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <div className="flex flex-row flex-wrap gap-2 w-100">
        {value.map((tag, index) => {
          return (
            <Badge key={`${tag}-${index}`} className="flex gap-1">
              {tag}
              <button
                type="button"
                disabled={disabled}
                className="inline-flex h-5 w-5 items-center justify-center rounded-full text-inherit opacity-70 hover:opacity-100 hover:bg-primary-hover disabled:opacity-50"
                onClick={() => {
                  onChange(value.filter((_, i) => i !== index))
                }}
              >
                <IconX size={10} />
              </button>
            </Badge>
          )
        })}
      </div>
      <Input
        disabled={disabled}
        placeholder={placeholder}
        value={inputValue}
        onChange={(e) => setInputValue(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            const nextValue = inputValue.trim()
            if (nextValue.length !== 0) {
              onChange([...value, nextValue])
              setInputValue('')
            }
            // If we don't invoke preventDefault() upstream components
            // may do weird things (like submitting forms...)
            e.preventDefault()
          }
        }}
      />
    </div>
  )
}

export default TagInput
