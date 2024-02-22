'use client'
import { CreateTeam } from 'app/admin/teams/_components'
import { useTranslation } from 'next-i18next'
import { useState } from 'react'
import { AdminPageTitle } from '@/app/admin/components/AdminPageTitle'
import { useTeams, mutateTeams } from '@/hooks/teams'
import { WithLoadingAndError } from '@/components/ui'
import { Column, SimpleTable, column } from '@/components/ui/tables'
import toast from 'react-hot-toast'
import { delete_ } from '@/lib/fetch'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { TeamWithMemberCount } from '@/types/team'
import DeleteButton from '../components/DeleteButton'
import { Link } from '@/components/ui/link'
import CreateButton from '../components/CreateButton'

export const dynamic = 'force-dynamic'

const AllTeams = () => {
  const [visible, setVisible] = useState(false)
  const { t } = useTranslation('common')
  const { isLoading, error, data: teams } = useTeams()

  const modalContext = useConfirmationContext()
  async function onDelete(team: TeamWithMemberCount) {
    const result = await modalContext.askConfirmation({
      title: `${t('remove-team')} ${team.name}`,
      message: <p>{t('remove-team-confirmation')}</p>,
      confirmMsg: t('remove-team'),
    })
    if (!result) return

    const response = await delete_<void>(`/api/teams/${team.slug}`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutateTeams()
    toast.success(t('team-deleted'))
  }

  const columns: Column<TeamWithMemberCount>[] = [
    column(t('name'), (team: TeamWithMemberCount) => (
      <Link variant="ghost" href={`/admin/teams/${team.slug}/members`}>
        {team.name}
      </Link>
    )),
    column(t('members'), (team: TeamWithMemberCount) => `${team.memberCount}`),
    column(t('created-at'), (team: TeamWithMemberCount) =>
      new Date(team.createdAt).toLocaleString()
    ),
    column(t('actions'), (team: TeamWithMemberCount) => (
      <DeleteButton
        onClick={() => {
          onDelete(team)
        }}
      >
        {t('remove-team')}
      </DeleteButton>
    )),
  ]

  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      <AdminPageTitle title={t('all-teams')}>
        <CreateButton onClick={() => setVisible(true)} />
      </AdminPageTitle>
      <SimpleTable columns={columns} rows={teams ?? []} keygen={(t) => t.id} />
      <CreateTeam visible={visible} setVisible={setVisible} />
    </WithLoadingAndError>
  )
}

export default AllTeams
