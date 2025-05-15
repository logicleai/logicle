import { useTranslation } from 'react-i18next'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { Sharing } from '@/types/dto'
import { post } from '@/lib/fetch'
import * as dto from '@/types/dto'
import toast from 'react-hot-toast'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { WorkspaceRole } from '@/types/workspace'
import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Check, ChevronsUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

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

export const AssistantPublishDialog = ({
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
  const [open, setOpen] = useState(false)

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

  const publish = async () => {
    const response = await post<dto.Sharing[]>(`${assistantUrl}/publish`, sharingState)
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
  const selectedWorkspaces = visibleWorkspaces.filter((w) => isSharedWithWorkspace(w.id))
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogHeader className="font-bold">{t('create-directory-connection')}</DialogHeader>
      <DialogContent className="flex flex-col">
        <DialogTitle>{t('publish')}</DialogTitle>
        <RadioGroup value={mode} onValueChange={handleModeChange} className="flex flex-col gap-4">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value={Mode.ONLYME} id={Mode.ONLYME} />
            <div>
              <Label htmlFor={Mode.ONLYME}>{t('only-me')}</Label>
              <p className="text-sm text-muted-foreground">
                {t('only_you_will_have_access_to_this_assistant')}
              </p>
            </div>
          </div>
          {showWorkspaces && (
            <>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value={Mode.WORKSPACES} id="workspaces" />
                <div className="flex-1">
                  <Label htmlFor={Mode.WORKSPACES}>{t('share_with_workspace')}</Label>
                  <p className="text-sm text-muted-foreground mb-2">
                    {t('share_with_one_or_more_workspaces')}
                  </p>
                  {mode == 'workspaces' && (
                    <Popover open={open} onOpenChange={setOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          size="small"
                          role="combobox"
                          aria-expanded={open}
                          className="justify-between w-full px-0"
                        >
                          <div className="flex flex-wrap gap-2">
                            {selectedWorkspaces.length == 0 ? (
                              <span className="px-2 text-muted-foreground">
                                {t('select_workspaces...')}
                              </span>
                            ) : (
                              <>
                                {selectedWorkspaces.map((workspace) => (
                                  <Badge
                                    key={workspace.id}
                                    variant="secondary"
                                    className="flex items-center gap-1 text-sm"
                                  >
                                    {workspace.name}
                                  </Badge>
                                ))}
                              </>
                            )}
                          </div>
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0 w-[--radix-popover-trigger-width]">
                        <Command>
                          <CommandList>
                            <CommandEmpty>{t('no_workspace_found')}</CommandEmpty>
                            <CommandGroup>
                              {visibleWorkspaces.map((workspace) => (
                                <CommandItem
                                  key={workspace.id}
                                  value={workspace.name}
                                  disabled={!canShareWithWorkspace(workspace)}
                                  onSelect={() => {
                                    setSharingWithWorkspace(
                                      workspace,
                                      !isSharedWithWorkspace(workspace.id)
                                    )
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      'mr-2 h-4 w-4',
                                      isSharedWithWorkspace(workspace.id)
                                        ? 'opacity-100'
                                        : 'opacity-0'
                                    )}
                                  />
                                  {workspace.name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}
                </div>
              </div>
            </>
          )}
          <div className="flex items-center space-x-2">
            <RadioGroupItem disabled={profile?.role != 'ADMIN'} value={Mode.ALL} id={Mode.ALL} />
            <div>
              <Label htmlFor={Mode.ALL}>{t('everyone_in_the_company')}</Label>
              <p className="text-sm text-muted-foreground mb-2">
                {t('everyone_in_the_company_will_be_able_to_use_this_assistant')}
              </p>
            </div>
          </div>
        </RadioGroup>
        <Button className="self-center" onClick={publish}>
          {t('share')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
