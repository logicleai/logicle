import { LetterAvatar, WithLoadingAndError } from '@/components/ui'
import { useWorkspaceMembers, mutateWorkspaceMembers } from '@/hooks/workspaces'
import { useSession } from 'next-auth/react'
import { useTranslation } from 'react-i18next'
import toast from 'react-hot-toast'
import { UpdateMemberRoleDialog } from './UpdateMemberRoleDialog'
import { delete_ } from '@/lib/fetch'
import * as dto from '@/types/dto'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { AddWorkspaceMembersDialog } from './AddWorkspaceMembers'
import { useState } from 'react'
import { SearchBarWithButtonsOnRight } from '@/components/app/SearchBarWithButtons'
import { Button } from '@/components/ui/button'
import { IconHierarchy, IconTrash } from '@tabler/icons-react'
import { Action, ActionList } from '@/components/ui/actionlist'

export const WorkspaceMembers = ({ workspaceId }: { workspaceId: string }) => {
  const { data: session } = useSession()
  const { t } = useTranslation()

  const { isLoading, error, data: members } = useWorkspaceMembers(workspaceId)
  const [isAddMemberDialogVisible, setAddMemberDialogVisible] = useState(false)
  const [userModifyingRole, setUserModifyingRole] = useState<dto.WorkspaceMember | undefined>(
    undefined
  )
  const [searchTerm, setSearchTerm] = useState<string>('')
  const modalContext = useConfirmationContext()

  if (!members) {
    return null
  }

  const removeWorkspaceMember = async (member: dto.WorkspaceMember | null) => {
    if (!member) return

    const sp = new URLSearchParams({ memberId: member.userId })

    const response = await delete_(`/api/workspaces/${workspaceId}/members?${sp.toString()}`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }

    await mutateWorkspaceMembers(workspaceId)
    toast.success(t('member-deleted'))
  }

  async function onDelete(member: dto.WorkspaceMemberWithUser) {
    const result = await modalContext.askConfirmation({
      title: `${t('confirm-delete-member')} ${member.name}`,
      message: t('delete-member-warning'),
      confirmMsg: t('confirm-delete-member'),
    })
    if (!result) return

    await removeWorkspaceMember(member)
  }

  const canModifyMember = (member: dto.WorkspaceMember) => {
    return session?.user.role === 'ADMIN' || session?.user.id !== member.userId
  }

  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      <SearchBarWithButtonsOnRight searchTerm={searchTerm} onSearchTermChange={setSearchTerm}>
        <Button onClick={() => setAddMemberDialogVisible(true)}>{t('add-members')}</Button>
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
                  <TableCell>{member.role}</TableCell>
                  {canModifyMember(member) && (
                    <TableCell>
                      <ActionList>
                        <Action
                          icon={IconTrash}
                          onClick={async () => {
                            await onDelete(member)
                          }}
                          text={t('remove')}
                          destructive={true}
                        />
                        <Action
                          icon={IconHierarchy}
                          onClick={async () => {
                            setUserModifyingRole(member)
                          }}
                          text={t('edit_role')}
                        />
                      </ActionList>
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
        </TableBody>
      </Table>
      {isAddMemberDialogVisible && (
        <AddWorkspaceMembersDialog
          members={members}
          onClose={() => setAddMemberDialogVisible(false)}
          workspaceId={workspaceId}
        />
      )}
      {userModifyingRole && (
        <UpdateMemberRoleDialog
          onClose={() => setUserModifyingRole(undefined)}
          workspaceId={workspaceId}
          member={userModifyingRole}
        />
      )}
    </WithLoadingAndError>
  )
}
