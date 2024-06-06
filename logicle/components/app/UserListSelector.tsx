import { useTranslation } from 'next-i18next'
import { useUsers } from '@/hooks/users'
import { useState } from 'react'
import { SearchBarWithButtonsOnRight } from './SearchBarWithButtons'
import { Column, ScrollableTable, column } from '@/components/ui/tables'
import * as dto from '@/types/dto'

interface Props {
  onSelectionChange: (users: dto.SelectableUserDTO[]) => void
}

export const UserListSelector = ({ onSelectionChange }: Props) => {
  const { t } = useTranslation('common')
  const { data: users_ } = useUsers()
  const [selection, setSelection] = useState<Map<string, dto.SelectableUserDTO>>(new Map())
  const [searchTerm, setSearchTerm] = useState<string>('')
  const users = users_ || []
  const toggleUser = (user: dto.SelectableUserDTO) => {
    const newMap = new Map(selection)
    if (!newMap.delete(user.id)) {
      newMap.set(user.id, user)
    }
    setSelection(newMap)
    onSelectionChange(Array.from(newMap.values()))
  }
  const usersFiltered =
    searchTerm.length == 0
      ? users
      : users.filter((u) => {
          return u.name.includes(searchTerm) || u.email.includes(searchTerm)
        })
  const columns: Column<dto.SelectableUserDTO>[] = [
    column(t('table-column-name'), (user: dto.SelectableUserDTO) => <>{user.name}</>),
    column(t('table-column-email'), (user: dto.SelectableUserDTO) => <div>{user.email}</div>),
    column(t('table-column-selected'), (user: dto.SelectableUserDTO) => (
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
