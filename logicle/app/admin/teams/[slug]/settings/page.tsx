'use client'
import { WithLoadingAndError } from '@/components/ui'
import { TeamSettings, TeamTab } from 'app/admin/teams/_components'
import { useTeam } from '@/hooks/teams'
import { useParams } from 'next/navigation'

const Settings = () => {
  const { slug } = useParams() as { slug: string }
  const { isLoading, error, data: team } = useTeam(slug)

  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      {team && (
        <>
          <TeamTab activeTab="settings" team={team} />
          <TeamSettings team={team} />
        </>
      )}
    </WithLoadingAndError>
  )
}

export default Settings
