import { useTranslation } from 'react-i18next'
import { useUsers } from '@/hooks/users'
import { useState } from 'react'
import { SearchBarWithButtonsOnRight } from './SearchBarWithButtons'
import { Column, ScrollableTable, column } from '@/components/ui/tables'
import * as dto from '@/types/dto'

interface Props {
  onSelectionChange: (users: dto.User[]) => void
  exclude: string[]
}

export const UserListSelector = ({ onSelectionChange, exclude }: Props) => {
  const { t } = useTranslation()
  const { data: users_ } = useUsers()
  const [selection, setSelection] = useState<Map<string, dto.User>>(new Map())
  const [searchTerm, setSearchTerm] = useState<string>('')

  const excludeSet = new Set<string>(exclude)
  const users = (users_ || []).filter((u) => {
    return !excludeSet.has(u.id)
  })
  const toggleUser = (user: dto.User) => {
    const newMap = new Map(selection)
    if (!newMap.delete(user.id)) {
      newMap.set(user.id, user)
    }
    setSelection(newMap)
    onSelectionChange(Array.from(newMap.values()))
  }
  const searchTermLowerCase = searchTerm.toLocaleLowerCase()
  const usersFiltered =
    searchTerm.length == 0
      ? users
      : users.filter((u) => {
          return (
            u.name.toLocaleLowerCase().includes(searchTermLowerCase) ||
            u.email.toLocaleLowerCase().includes(searchTermLowerCase)
          )
        })
  const columns: Column<dto.User>[] = [
    column(t('table-column-name'), (user: dto.User) => <>{user.name}</>),
    column(t('table-column-email'), (user: dto.User) => <div>{user.email}</div>),
    column(t('table-column-selected'), (user: dto.User) => (
      <div className="text-center">{selection.has(user.id) ? '✔' : ''}</div>
    )),
  ]

  return (
    <div>
      <SearchBarWithButtonsOnRight
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
      ></SearchBarWithButtonsOnRight>
      {false && (
        <div className="flex flex-horz">
          {Array.from(selection.values()).map((u) => {
            return (
              <div key={u.id} onClick={() => toggleUser(u)}>
                {u.name}
              </div>
            )
          })}
        </div>
      )}
      <ScrollableTable
        className="flex-1 text-body1 h-[24rem] table-auto"
        columns={columns}
        onRowClick={toggleUser}
        rows={usersFiltered}
        keygen={(t) => t.id}
      />
    </div>
  )
}
