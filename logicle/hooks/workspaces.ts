import { useSWRJson } from './swr'
import { mutate } from 'swr'
import * as dto from '@/types/dto'
import { WorkspaceMemberWithUser } from '@/types/workspace'
import { WorkspaceWithMemberCount } from '@/types/workspace'

const url = `/api/workspaces`

export const useWorkspaces = () => {
  return useSWRJson<WorkspaceWithMemberCount[]>(url)
}

export const mutateWorkspaces = async () => {
  mutate(url)
}

export const useWorkspace = (slug: string) => {
  return useSWRJson<dto.Workspace>(`/api/workspaces/${slug}`)
}

export const mutateWorkspace = (slug: string) => {
  return mutate(`/api/workspaces/${slug}`)
}

export const useWorkspaceMembers = (slug: string) => {
  const url = `/api/workspaces/${slug}/members`
  return useSWRJson<WorkspaceMemberWithUser[]>(url)
}

export const mutateWorkspaceMembers = async (slug: string) => {
  const url = `/api/workspaces/${slug}/members`
  mutate(url)
}
