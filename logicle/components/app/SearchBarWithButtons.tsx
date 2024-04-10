import { ReactNode } from 'react'
import { Input } from '../ui/input'

interface Params {
  children: ReactNode
  searchTerm: string
  onSearchTermChange: (searchTerm: string) => void
}

export const SearchBarWithButtonsOnRight = ({
  searchTerm,
  onSearchTermChange,
  children,
}: Params) => {
  return (
    <div className="flex gap-3">
      <Input
        className="flex-1"
        value={searchTerm}
        onChange={(evt) => onSearchTermChange(evt.target.value)}
      ></Input>
      {children}
    </div>
  )
  return
}
