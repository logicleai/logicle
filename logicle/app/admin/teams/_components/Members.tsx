import { LetterAvatar, WithLoadingAndError } from '@/components/ui'
import { Team } from '@/types/db'
import { useTeamMembers, mutateTeamMembers } from '@/hooks/teams'
import { useSession } from 'next-auth/react'
import { useTranslation } from 'next-i18next'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'
import UpdateMemberRole from './UpdateMemberRole'
import ConfirmationDialog from '@/components/ui/ConfirmationDialog'
import { useState } from 'react'
import { delete_ } from '@/lib/fetch'
import AddMember from './AddMember'
import { TeamMemberDTO } from '@/types/team'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

const Members = ({ team }: { team: Team }) => {
  const { data: session } = useSession()
  const { t } = useTranslation('common')
  const [isAddMemberDialogVisible, setAddMemberDialogVisible] = useState(false)
  const [selectedMember, setSelectedMember] = useState<TeamMemberDTO | null>(null)
  const [confirmationDialogVisible, setConfirmationDialogVisible] = useState(false)

  const { isLoading, error, data: members } = useTeamMembers(team.slug)

  if (!members) {
    return null
  }

  const removeTeamMember = async (member: TeamMemberDTO | null) => {
    if (!member) return

    const sp = new URLSearchParams({ memberId: member.userId })

    const response = await delete_(`/api/teams/${team.slug}/members?${sp.toString()}`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }

    mutateTeamMembers(team.slug)
    toast.success(t('member-deleted'))
  }

  const canRemoveMember = (member: TeamMemberDTO) => {
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
                  <UpdateMemberRole team={team} member={member} />
                </TableCell>
                {canRemoveMember(member) && (
                  <TableCell>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setSelectedMember(member)
                        setConfirmationDialogVisible(true)
                      }}
                      size="default"
                    >
                      {t('remove')}
                    </Button>
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

      {confirmationDialogVisible && (
        <ConfirmationDialog
          visible={confirmationDialogVisible}
          onCancel={() => setConfirmationDialogVisible(false)}
          onConfirm={() => removeTeamMember(selectedMember)}
          title={t('confirm-delete-member')}
        >
          {t('delete-member-warning')}
        </ConfirmationDialog>
      )}
      <AddMember
        visible={isAddMemberDialogVisible}
        setVisible={setAddMemberDialogVisible}
        team={team}
      />
    </WithLoadingAndError>
  )
}

export default Members
