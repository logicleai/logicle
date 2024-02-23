import { LetterAvatar, WithLoadingAndError } from '@/components/ui'
import { Workspace } from '@/types/db'
import { useWorkspaceMembers, mutateWorkspaceMembers } from '@/hooks/workspaces'
import { useSession } from 'next-auth/react'
import { useTranslation } from 'next-i18next'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'
import UpdateMemberRole from './UpdateMemberRole'
import ConfirmationDialog from '@/components/ui/ConfirmationDialog'
import { useState } from 'react'
import { delete_ } from '@/lib/fetch'
import AddMember from './AddMember'
import { WorkspaceMemberDTO, WorkspaceMemberWithUser } from '@/types/workspace'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import DeleteButton from '../../components/DeleteButton'
import { useConfirmationContext } from '@/components/providers/confirmationContext'

const WorkspaceMembers = ({ workspace }: { workspace: Workspace }) => {
  const { data: session } = useSession()
  const { t } = useTranslation('common')
  const [isAddMemberDialogVisible, setAddMemberDialogVisible] = useState(false)

  const { isLoading, error, data: members } = useWorkspaceMembers(workspace.slug)
  const modalContext = useConfirmationContext()

  if (!members) {
    return null
  }

  const removeWorkspaceMember = async (member: WorkspaceMemberDTO | null) => {
    if (!member) return

    const sp = new URLSearchParams({ memberId: member.userId })

    const response = await delete_(`/api/workspaces/${workspace.slug}/members?${sp.toString()}`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }

    mutateWorkspaceMembers(workspace.slug)
    toast.success(t('member-deleted'))
  }

  async function onDelete(member: WorkspaceMemberWithUser) {
    const result = await modalContext.askConfirmation({
      title: `${t('confirm-delete-member')} ${member.name}`,
      message: <p>{t('delete-member-warning')}</p>,
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
          {members.map((member) => {
            return (
              <TableRow key={member.id}>
                <TableCell>
                  <div className="flex items-center justify-start space-x-2">
                    <LetterAvatar name={member.name} />
                    <span>{member.name}</span>
                  </div>
                </TableCell>
                <TableCell>{member.email}</TableCell>
                <TableCell>
                  <UpdateMemberRole workspace={workspace} member={member} />
                </TableCell>
                {canRemoveMember(member) && (
                  <TableCell>
                    <DeleteButton onClick={() => onDelete(member)}>{t('remove')}</DeleteButton>
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
      <Button onClick={async () => setAddMemberDialogVisible(!isAddMemberDialogVisible)}>
        Add Member
      </Button>

      <AddMember
        visible={isAddMemberDialogVisible}
        setVisible={setAddMemberDialogVisible}
        workspace={workspace}
      />
    </WithLoadingAndError>
  )
}

export default WorkspaceMembers
