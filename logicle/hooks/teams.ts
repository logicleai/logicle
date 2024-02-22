import { useSWRJson } from './swr'
import { mutate } from 'swr'
import type { Team } from '@/types/db'
import { TeamMemberWithUser } from '@/types/team'
import { TeamWithMemberCount } from '@/types/team'

const url = `/api/teams`

export const useTeams = () => {
  return useSWRJson<TeamWithMemberCount[]>(url)
}

export const mutateTeams = async () => {
  mutate(url)
}

export const useTeam = (slug: string) => {
  return useSWRJson<Team>(`/api/teams/${slug}`)
}

export const mutateTeam = (slug: string) => {
  return mutate(`/api/teams/${slug}`)
}

export const useTeamMembers = (slug: string) => {
  const url = `/api/teams/${slug}/members`
  return useSWRJson<TeamMemberWithUser[]>(url)
}

export const mutateTeamMembers = async (slug: string) => {
  const url = `/api/teams/${slug}/members`
  mutate(url)
}
