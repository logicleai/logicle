import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { IconX } from '@tabler/icons-react'
import { Command, CommandEmpty, CommandItem, CommandList } from '@/components/ui/command'

interface Props {
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
  placeholder?: string
  className?: string
  suggestions?: readonly string[]
  allowCustom?: boolean
}

const TagInput = ({
  value,
  onChange,
  disabled = false,
  placeholder,
  className,
  suggestions = [],
  allowCustom = true,
}: Props) => {
  const { t } = useTranslation()
  const [inputValue, setInputValue] = useState('')
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement | null>(null)
  const normalizedInput = inputValue.trim()

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (!containerRef.current) return
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
    }
  }, [])

  const normalizedSuggestions = useMemo(() => {
    return suggestions
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .filter((item, index, all) => all.indexOf(item) === index)
  }, [suggestions])

  const filteredSuggestions = useMemo(() => {
    if (normalizedSuggestions.length === 0) return []
    const query = normalizedInput.toLowerCase()
    return normalizedSuggestions
      .filter((item) => !value.includes(item))
      .filter((item) => (query.length === 0 ? true : item.toLowerCase().includes(query)))
  }, [normalizedSuggestions, normalizedInput, value])

  const canCreate = allowCustom && normalizedInput.length > 0 && !value.includes(normalizedInput)

  const canShowMenu = !disabled && (filteredSuggestions.length > 0 || canCreate)

  const addValue = (nextValue: string) => {
    const trimmed = nextValue.trim()
    if (trimmed.length === 0 || value.includes(trimmed)) return
    onChange([...value, trimmed])
    setInputValue('')
    setOpen(false)
  }

  return (
    <div className={`flex flex-col gap-2 ${className ?? ''}`}>
      <div
        ref={containerRef}
        className="relative rounded-md border border-input bg-background px-2 py-1"
      >
        <div className={`flex flex-row flex-wrap gap-2 w-100 ${value.length > 0 ? 'py-1' : ''}`}>
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
          className="h-9 border-0 px-1 py-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
          onFocus={() => {
            if (!disabled) setOpen(true)
          }}
          onClick={() => {
            if (!disabled) setOpen(true)
          }}
          onChange={(e) => {
            setInputValue(e.currentTarget.value)
            if (!disabled) setOpen(true)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (allowCustom) {
                addValue(inputValue)
              }
              // If we don't invoke preventDefault() upstream components
              // may do weird things (like submitting forms...)
              e.preventDefault()
            } else if (e.key === 'Escape') {
              setOpen(false)
            }
          }}
        />
        {open && canShowMenu && (
          <div className="absolute z-50 mt-1 w-max min-w-[12rem] rounded-md border bg-popover p-1 shadow-md">
            <Command>
              <CommandList className="max-h-60">
                {canCreate && (
                  <CommandItem onSelect={() => addValue(inputValue)}>
                    {t('tag_add', { tag: normalizedInput })}
                  </CommandItem>
                )}
                {filteredSuggestions.map((item) => (
                  <CommandItem key={item} onSelect={() => addValue(item)}>
                    {item}
                  </CommandItem>
                ))}
                {filteredSuggestions.length === 0 && !canCreate && (
                  <CommandEmpty>{t('tag_no_suggestions')}</CommandEmpty>
                )}
              </CommandList>
            </Command>
          </div>
        )}
      </div>
    </div>
  )
}

export default TagInput
