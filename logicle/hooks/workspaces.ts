import { useSWRJson } from './swr'
import { mutate } from 'swr'
import * as dto from '@/types/dto'

const url = `/api/workspaces`

export const useWorkspaces = () => {
  return useSWRJson<dto.WorkspaceWithMemberCount[]>(url)
}

export const mutateWorkspaces = async () => {
  return mutate(url)
}

export const useWorkspace = (workspaceId: string) => {
  return useSWRJson<dto.Workspace>(`/api/workspaces/${workspaceId}`)
}

export const mutateWorkspace = (workspaceId: string) => {
  return mutate(`/api/workspaces/${workspaceId}`)
}

export const useWorkspaceMembers = (workspaceId: string) => {
  const url = `/api/workspaces/${workspaceId}/members`
  return useSWRJson<dto.WorkspaceMemberWithUser[]>(url)
}

export const mutateWorkspaceMembers = async (workspaceId: string) => {
  const url = `/api/workspaces/${workspaceId}/members`
  return mutate(url)
}
