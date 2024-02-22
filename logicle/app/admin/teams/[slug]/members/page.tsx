'use client'
import { WithLoadingAndError } from '@/components/ui'
import { Members, TeamTab } from 'app/admin/teams/_components'
import { useTeam } from '@/hooks/teams'
import { useParams } from 'next/navigation'

const TeamMembers = () => {
  const { slug } = useParams() as { slug: string }
  const { isLoading, error, data: team } = useTeam(slug)
  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      {team && (
        <>
          <TeamTab activeTab="members" team={team} />
          <div className="flex flex-col">
            <Members team={team} />
          </div>
        </>
      )}
    </WithLoadingAndError>
  )
}

export default TeamMembers
