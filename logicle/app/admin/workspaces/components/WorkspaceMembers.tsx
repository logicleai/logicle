import { LetterAvatar, WithLoadingAndError } from '@/components/ui'
import { useWorkspaceMembers, mutateWorkspaceMembers } from '@/hooks/workspaces'
import { useSession } from 'next-auth/react'
import { useTranslation } from 'next-i18next'
import toast from 'react-hot-toast'
import UpdateMemberRole from './UpdateMemberRole'
import { delete_ } from '@/lib/fetch'
import { WorkspaceMemberDTO, WorkspaceMemberWithUser } from '@/types/workspace'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import AddMember from './AddMember'
import { useState } from 'react'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { Button } from '@/components/ui/button'
import { IconTrash } from '@tabler/icons-react'
import { ActionList } from '@/components/ui/actionlist'

export const WorkspaceMembers = ({ workspaceId }: { workspaceId: string }) => {
  const { data: session } = useSession()
  const { t } = useTranslation('common')

  const { isLoading, error, data: members } = useWorkspaceMembers(workspaceId)
  const [isAddMemberDialogVisible, setAddMemberDialogVisible] = useState(false)
  const [searchTerm, setSearchTerm] = useState<string>('')
  const modalContext = useConfirmationContext()

  if (!members) {
    return null
  }

  const removeWorkspaceMember = async (member: WorkspaceMemberDTO | null) => {
    if (!member) return

    const sp = new URLSearchParams({ memberId: member.userId })

    const response = await delete_(`/api/workspaces/${workspaceId}/members?${sp.toString()}`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }

    mutateWorkspaceMembers(workspaceId)
    toast.success(t('member-deleted'))
  }

  async function onDelete(member: WorkspaceMemberWithUser) {
    const result = await modalContext.askConfirmation({
      title: `${t('confirm-delete-member')} ${member.name}`,
      message: t('delete-member-warning'),
      confirmMsg: t('confirm-delete-member'),
    })
    if (!result) return

    removeWorkspaceMember(member)
  }

  const canRemoveMember = (member: WorkspaceMemberDTO) => {
    return session?.user.id != member.userId
  }

  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
        <Button onClick={() => setAddMemberDialogVisible(true)}>{t('Add member')}</Button>
      </SearchBarWithButtonsOnRight>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('name')}</TableHead>
            <TableHead>{t('email')}</TableHead>
            <TableHead>{t('role')}</TableHead>
            <TableHead>{t('action')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {members
            .filter((m) => m.name.toUpperCase().includes(searchTerm.toUpperCase()))
            .map((member) => {
              return (
                <TableRow key={member.id}>
                  <TableCell>
                    <div className="flex items-center justify-start space-x-2">
                      <LetterAvatar name={member.name} />
                      <span className="flex-1 min-width:0px">{member.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell>
                    <UpdateMemberRole workspaceId={workspaceId} member={member} />
                  </TableCell>
                  {canRemoveMember(member) && (
                    <TableCell>
                      <ActionList
                        actions={[
                          {
                            icon: IconTrash,
                            onClick: () => {
                              onDelete(member)
                            },
                            text: t('remove'),
                            destructive: true,
                          },
                        ]}
                      />
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
        </TableBody>
      </Table>
      <AddMember
        visible={isAddMemberDialogVisible}
        setVisible={setAddMemberDialogVisible}
        workspaceId={workspaceId}
      />
    </WithLoadingAndError>
  )
}
