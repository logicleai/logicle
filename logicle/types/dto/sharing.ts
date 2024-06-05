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
