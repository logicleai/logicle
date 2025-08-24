import { WithLoadingAndError } from '@/components/ui'
import { useTranslation } from 'react-i18next'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useState } from 'react'
import { useAssistants } from '@/hooks/assistants'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { AssistantAvatar } from '@/components/app/Avatars'

export const WorkspaceAssistants = ({ workspaceId }: { workspaceId: string }) => {
  const { t } = useTranslation()

  const { isLoading, error, data: assistants } = useAssistants()
  const [searchTerm, setSearchTerm] = useState<string>('')

  if (!assistants) {
    return null
  }
  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      <SearchBarWithButtonsOnRight
        searchTerm={searchTerm}
        onSearchTermChange={setSearchTerm}
      ></SearchBarWithButtonsOnRight>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('name')}</TableHead>
            <TableHead>{t('description')}</TableHead>
            <TableHead>{t('owner')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assistants
            .filter((a) =>
              a.sharing.some((s) => s.type === 'workspace' && s.workspaceId === workspaceId)
            )
            .filter((a) => a.name.toUpperCase().includes(searchTerm.toUpperCase()))
            .map((assistant) => {
              return (
                <TableRow key={assistant.id}>
                  <TableCell>
                    <div className="flex items-center justify-start space-x-2">
                      <AssistantAvatar assistant={assistant} />
                      <span className="flex-1 min-width:0px">{assistant.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-start space-x-2">
                      <span className="flex-1 min-width:0px">{assistant.description}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-start space-x-2">
                      <span className="flex-1 min-width:0px">{assistant.ownerName}</span>
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
        </TableBody>
      </Table>
    </WithLoadingAndError>
  )
}
