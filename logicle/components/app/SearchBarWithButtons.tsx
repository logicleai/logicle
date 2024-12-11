import { ReactNode } from 'react'
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
  return (
    <div className="flex gap-3">
      <div className="flex-1 relative">
        <Input
          className="flex-1 pl-10"
          value={searchTerm}
          placeholder={t('search_placeholder')}
          onChange={(evt) => onSearchTermChange(evt.target.value)}
        ></Input>
        <div className="absolute top-0 bottom-0 left-0 flex items-center ml-2">
          <IconSearch></IconSearch>
        </div>
      </div>
      {children}
    </div>
  )
  return
}
