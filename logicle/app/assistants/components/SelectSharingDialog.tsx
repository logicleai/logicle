import { useTranslation } from 'react-i18next'
import { Switch } from '@/components/ui/switch'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Dialog, DialogContent, DialogHeader } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { Sharing } from '@/types/dto'
import { post } from '@/lib/fetch'
import * as dto from '@/types/dto'
import toast from 'react-hot-toast'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { WorkspaceRole } from '@/types/workspace'

interface Params {
  onClose: () => void
  initialStatus: Sharing[]
  onSharingChange: (sharing: Sharing[]) => void
  assistantUrl: string
}

interface VisibleWorkspace {
  id: string
  name: string
  role: WorkspaceRole
}

export enum Mode {
  ONLYME = 'only_me',
  ALL = 'all',
  WORKSPACES = 'workspaces',
}

const deriveMode = (sharing: Sharing[]) => {
  if (sharing.length == 0) {
    return Mode.ONLYME
  } else if (sharing.find((s) => s.type == 'all')) {
    return Mode.ALL
  } else {
    return Mode.WORKSPACES
  }
}

export const SelectSharingDialog = ({
  onClose,
  initialStatus,
  onSharingChange,
  assistantUrl,
}: Params) => {
  const { t } = useTranslation()
  const profile = useUserProfile()
  const visibleWorkspaces = profile?.workspaces || []
  const [sharingState, setSharingState] = useState<Sharing[]>(initialStatus)
  const [mode, setMode] = useState<string>(deriveMode(initialStatus))

  const canShareWithWorkspace = (worskpaceMembership: dto.WorkspaceMembership): boolean => {
    return (
      worskpaceMembership.role == 'ADMIN' ||
      worskpaceMembership.role == 'OWNER' ||
      worskpaceMembership.role == 'EDITOR'
    )
  }

  const isSharedWithWorkspace = (workspaceId: string) => {
    return (
      sharingState.find((s) => s.type == 'workspace' && s.workspaceId == workspaceId) != undefined
    )
  }

  const saveSharing = async () => {
    const response = await post<dto.Sharing[]>(`${assistantUrl}/sharing`, sharingState)
    if (response.error) {
      toast.error(response.error.message)
    } else {
      onSharingChange(response.data)
      onClose()
    }
  }

  const setSharingWithWorkspace = (workspace: VisibleWorkspace, add: boolean) => {
    const result = sharingState.filter(
      (s) => s.type != 'workspace' || s.workspaceId != workspace.id
    )
    if (add) {
      result.push({
        type: 'workspace',
        workspaceId: workspace.id,
        workspaceName: workspace.name,
      } as dto.Sharing)
    }
    setSharingState(result)
  }

  const handleModeChange = (value) => {
    setMode(value)
    if (value == 'all') {
      setSharingState([
        {
          type: 'all',
        } as dto.Sharing,
      ])
    } else {
      setSharingState([])
    }
  }
  const showWorkspaces = visibleWorkspaces.length != 0 || mode == Mode.WORKSPACES

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogHeader className="font-bold">{t('create-directory-connection')}</DialogHeader>
      <DialogContent className="flex flex-col">
        <RadioGroup value={mode} onValueChange={handleModeChange}>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value={Mode.ONLYME} id={Mode.ONLYME} />
            <Label htmlFor={Mode.ONLYME}>{t('only-me')}</Label>
          </div>
          {showWorkspaces && (
            <>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value={Mode.WORKSPACES} id="workspaces" />
                <Label htmlFor={Mode.WORKSPACES}>{t('share_with_workspace')}</Label>
              </div>
              <div>
                {visibleWorkspaces.map((workspace) => (
                  <div key={workspace.id} className="flex flex-horz">
                    <div>{workspace.name}</div>
                    <Switch
                      disabled={mode != Mode.WORKSPACES || !canShareWithWorkspace(workspace)}
                      className="mt-0 ml-auto"
                      checked={isSharedWithWorkspace(workspace.id)}
                      onCheckedChange={(checked) => setSharingWithWorkspace(workspace, checked)}
                    ></Switch>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="flex items-center space-x-2">
            <RadioGroupItem disabled={profile?.role != 'ADMIN'} value={Mode.ALL} id={Mode.ALL} />
            <Label htmlFor={Mode.ALL}>{t('everyone_in_the_company')}</Label>
          </div>
        </RadioGroup>
        <Button className="self-center" onClick={saveSharing}>
          {t('share')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
