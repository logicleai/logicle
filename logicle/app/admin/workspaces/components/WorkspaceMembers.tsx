import { LetterAvatar, WithLoadingAndError } from '@/components/ui'
import { useWorkspaceMembers, mutateWorkspaceMembers } from '@/hooks/workspaces'
import { useSession } from 'next-auth/react'
import { useTranslation } from 'next-i18next'
import toast from 'react-hot-toast'
import UpdateMemberRole from './UpdateMemberRole'
import * as dto from '@/types/dto'
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
import DeleteButton from '../../components/DeleteButton'
import { useConfirmationContext } from '@/components/providers/confirmationContext'

const WorkspaceMembers = ({ workspace }: { workspace: dto.Workspace }) => {
  const { data: session } = useSession()
  const { t } = useTranslation('common')

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
                    <span className="flex-1 min-width:0px">{member.name}</span>
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
    </WithLoadingAndError>
  )
}

export default WorkspaceMembers
