import { FC, KeyboardEvent } from 'react'
import Link from 'next/link'

interface Props {
  onRenameValueChange: (text: string) => void
  onEnter: () => void
  onCancel: () => void
  value: string // conversation.name
  disabled?: boolean
  renameValue: string
  isRenaming: boolean
  selected: boolean
  href: string
}

export const EditableLink: FC<Props> = ({
  href,
  value,
  disabled,
  selected,
  isRenaming,
  renameValue,
  onRenameValueChange,
  onEnter,
  onCancel,
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
      className={`relative w-full hover:bg-secondary-hover ${
        selected ? 'bg-secondary-hover' : 'hover:bg-secondary-hover/50'
      }`}
    >
      <Link
        prefetch={false}
        className={`flex w-full cursor-pointer items-center gap-3 rounded-lg p-2 text-h3 transition-colors duration-200 ${
          disabled ? 'disabled:cursor-not-allowed' : ''
        } ${isRenaming ? 'invisible' : ''} `}
        onBlur={() => onCancel()}
        href={href}
        draggable="true"
      >
        <span
          className={`relative flex-1 overflow-hidden text-ellipsis whitespace-nowrap break-all text-left text-h3 ${
            selected ? 'pr-4' : 'pr-1'
          }`}
        >
          {value}
        </span>
      </Link>
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
