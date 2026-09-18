import { ReactNode, useId } from 'react'
import { Input } from '../ui/input'
import { IconSearch } from '@tabler/icons-react'
import { useTranslation } from 'react-i18next'

interface Params {
  children?: ReactNode
  searchTerm: string
  onSearchTermChange: (searchTerm: string) => void
}

export const SearchBarWithButtonsOnRight = ({
  searchTerm,
  onSearchTermChange,
  children,
}: Params) => {
  const { t } = useTranslation()
  const inputId = useId()
  return (
    <div className="flex gap-3">
      <div className="flex-1 relative">
        <label htmlFor={inputId} className="sr-only">
          {t('search')}
        </label>
        <Input
          id={inputId}
          className="flex-1 pl-9"
          value={searchTerm}
          placeholder={t('search-placeholder')}
          onChange={(evt) => onSearchTermChange(evt.target.value)}
        ></Input>
        <div className="absolute top-0 bottom-0 left-0 flex items-center ml-2">
          <IconSearch size={18} className="text-muted-foreground"></IconSearch>
        </div>
      </div>
      {children}
    </div>
  )
}
