import { FC, KeyboardEvent, MouseEvent, useEffect, useRef } from 'react'
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

const moveCaretToEnd = (input: HTMLInputElement) => {
  const end = input.value.length
  input.setSelectionRange(end, end)
  input.scrollLeft = input.scrollWidth
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
  const renameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const input = renameInputRef.current
    if (isRenaming && input) {
      input.focus({ preventScroll: true })
      moveCaretToEnd(input)
    }
  }, [isRenaming])

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
      className={`relative min-w-0 flex-1 rounded-md transition-colors ${
        selected ? 'bg-background shadow-sm' : 'hover:bg-secondary-hover/70'
      } ${isRenaming ? 'box-border h-8 border border-input focus-within:border-primary' : ''}`}
    >
      {isRenaming ? (
        <input
          ref={renameInputRef}
          className="h-full w-full min-w-0 rounded-md border-0 bg-transparent px-2 text-left text-sm leading-3 outline-none"
          type="text"
          value={renameValue}
          onFocus={(event) => moveCaretToEnd(event.currentTarget)}
          onChange={(e) => {
            onRenameValueChange(e.target.value)
          }}
          onKeyDown={handleInputKeyDown}
          onBlur={onCancel}
        />
      ) : (
        <Link
          prefetch={false}
          className={`flex w-full min-w-0 cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors duration-200 ${
            disabled ? 'disabled:cursor-not-allowed' : ''
          }`}
          onBlur={() => onCancel()}
          onClick={handleClick}
          href={href}
          draggable="true"
        >
          <span
            className={`relative min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap break-all text-left text-sm ${
              selected ? 'pr-4' : 'pr-1'
            }`}
            title={value}
          >
            {value}
          </span>
        </Link>
      )}
    </div>
  )
}
