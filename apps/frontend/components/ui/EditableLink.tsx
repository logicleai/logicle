import { FC, KeyboardEvent, MouseEvent } from 'react'
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
  // When set, a plain click navigates via this callback (e.g. router-free
  // client state, see ChatPageContextProvider.navigateToChat) instead of
  // Next's <Link>. `href` is still rendered on the underlying <a> so
  // ctrl/cmd/middle-click, right-click "copy link", etc. keep working
  // natively — only the plain-left-click path is intercepted.
  onNavigate?: () => void
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
  onNavigate,
}) => {
  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (!onNavigate) return
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return
    }
    e.preventDefault()
    onNavigate()
  }
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
      className={`relative w-full rounded-md transition-colors ${
        selected ? 'bg-background shadow-sm' : 'hover:bg-secondary-hover/70'
      }`}
    >
      <Link
        prefetch={false}
        className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-200 ${
          disabled ? 'disabled:cursor-not-allowed' : ''
        } ${isRenaming ? 'invisible' : ''} `}
        onBlur={() => onCancel()}
        onClick={handleClick}
        href={href}
        draggable="true"
      >
        <span
          className={`relative flex-1 overflow-hidden text-ellipsis whitespace-nowrap break-all text-left text-sm ${
            selected ? 'pr-4' : 'pr-1'
          }`}
          title={value}
        >
          {value}
        </span>
      </Link>
      {isRenaming && (
        <input
          className="absolute bottom-1 left-1 right-1 top-1 overflow-hidden overflow-ellipsis border-neutral-400 bg-transparent pl-1 text-left text-sm leading-3 outline-none focus:border-neutral-100"
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
