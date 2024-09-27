interface AllSharingType {
  type: 'all'
}

interface WorkspaceSharingType {
  type: 'workspace'
  workspaceId: string
  workspaceName: string
}

export type Sharing = AllSharingType | WorkspaceSharingType
export type InsertableSharing = AllSharingType | Omit<WorkspaceSharingType, 'workspaceName'>

export function isAllSharingType(sharing: AllSharingType | WorkspaceSharingType): sharing is AllSharingType {
  return sharing.type == 'all';
}