import { useEffect, useRef } from 'react'
import { Input } from './input'
import { Button } from './button'
import { IconX } from '@tabler/icons-react'

interface StringListProps {
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
  maxItems: number
  addNewPlaceHolder?: string
}

export const StringList = ({
  value,
  onChange,
  addNewPlaceHolder,
  maxItems,
  disabled,
}: StringListProps) => {
  const restorePromptFocus = useRef<number>(-1)
  const promptContainerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (restorePromptFocus.current >= 0) {
      const child = promptContainerRef.current?.children[restorePromptFocus.current]
        .children[0] as HTMLInputElement
      child.focus()
    }
    restorePromptFocus.current = -1
  }, [restorePromptFocus.current])
  return (
    <div ref={promptContainerRef} className="flex flex-col gap-1">
      {value.map((prompt, index) => {
        return (
          <div key={index} className="flex flex-row gap-1">
            <Input
              disabled={disabled}
              className="flex-1"
              value={prompt}
              onChange={(evt) => {
                evt.preventDefault()
                const element = evt.target as HTMLInputElement
                const copy = [...value]
                copy[index] = element.value
                onChange(copy)
              }}
              onKeyDown={(evt) => {
                if (evt.key === 'Enter') {
                  evt.preventDefault()
                }
              }}
            ></Input>
            <Button
              disabled={disabled}
              type="button"
              variant="secondary"
              onClick={(evt) => {
                evt.preventDefault()
                onChange(value.slice(0, index).concat(value.slice(index + 1)))
              }}
            >
              <IconX size="18"></IconX>
            </Button>
          </div>
        )
      })}
      {value.length < maxItems && (
        <Input
          key={value.length}
          placeholder={addNewPlaceHolder}
          disabled={disabled}
          onChange={(evt) => {
            evt.preventDefault()
            const element = evt.target as HTMLInputElement
            const copy = [...value, element.value]
            restorePromptFocus.current = value.length
            onChange(copy)
          }}
        ></Input>
      )}
    </div>
  )
}
