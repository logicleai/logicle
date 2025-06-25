import { FC, KeyboardEvent } from 'react'
import { Button } from './button'

interface Props {
  onClick: () => void // handleSelectConversation(conversation)
  onRenameValueChange: (text: string) => void
  onEnter: () => void
  onCancel: () => void
  value: string // conversation.name
  disabled?: boolean
  renameValue: string
  isRenaming: boolean
  selected: boolean
}

export const EditableButton: FC<Props> = ({
  value,
  disabled,
  selected,
  isRenaming,
  renameValue,
  onRenameValueChange,
  onEnter,
  onCancel,
  onClick,
}) => {
  const handleInputKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onEnter()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
    e.stopPropagation()
  }

  //console.debug(`isRenaming = ${isRenaming} value = ${value} renameValue = ${renameValue}`)
  return (
    <div
      className={`position-relative w-full ${
        selected ? 'bg-secondary-hover' : 'hover:bg-secondary-hover/50'
      }`}
    >
      <Button
        variant="ghost"
        size="link"
        className={`flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 text-h3 transition-colors duration-200 ${
          disabled ? 'disabled:cursor-not-allowed' : ''
        } ${isRenaming ? 'text-transparent' : ''} `}
        onClick={() => onClick()}
        onBlur={() => onCancel()}
        disabled={disabled}
        draggable="true"
      >
        <div
          className={`relative flex-1 overflow-hidden text-ellipsis whitespace-nowrap break-all text-left text-h3 ${
            selected ? 'pr-4' : 'pr-1'
          }`}
        >
          {value}
        </div>
      </Button>
      {isRenaming && (
        <input
          className="absolute top-1 bottom-1 right-1 left-1 pl-1 bg-transparent overflow-hidden overflow-ellipsis border-neutral-400 text-left text-h3 leading-3 outline-none focus:border-neutral-100"
          type="text"
          value={renameValue}
          onChange={(e) => {
            onRenameValueChange(e.target.value)
          }}
          onKeyDown={handleInputKeyDown}
          onBlur={onCancel}
          autoFocus
        />
      )}
    </div>
  )
}
