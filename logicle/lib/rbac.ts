import { WorkspaceRole } from '@/types/workspace'
import * as dto from '@/types/dto'

/**
 * @param assistant
 * @param profile the user profile
 * @returns whether the user can edit the assistant
 */
export const canEditAssistant = (
  assistant: { owner: string; sharing: dto.Sharing[] },
  userId: string,
  workspaceMemberships: dto.WorkspaceMembership[]
) => {
  // A user can edit the assistant if:
  // - he is the owner
  // - he has the WorkspaceRole Editor role in the same workspace where the assistant has been shared
  //   (if the assistant has been shared to all it is editable only by the owner)
  if (assistant.owner == userId) return true

  return assistant.sharing.some((s) => {
    if (dto.isAllSharingType(s)) return false

    return workspaceMemberships.some((w) => {
      return (
        w.id == s.workspaceId &&
        (w.role == WorkspaceRole.EDITOR ||
          w.role == WorkspaceRole.OWNER ||
          w.role == WorkspaceRole.ADMIN)
      )
    })
  })
}

export const canDeleteAssistant = (
  assistant: dto.UserAssistant,
  profile: dto.UserProfile | undefined
) => {
  // A user can delete the assistant if:
  // - he is the owner
  // - he is an admin
  return assistant.owner == profile?.id || profile?.role == 'ADMIN'
}

export const isToolVisible = (tool: dto.Tool, userRole: string, userWorkspaces: string[]) => {
  const sharing = tool.sharing
  if (sharing.type == 'public') return true
  else if (sharing.type == 'workspace') {
    return sharing.workspaces.some((s) => {
      return userWorkspaces.includes(s)
    })
  } else return userRole == 'ADMIN'
}
