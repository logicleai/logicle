import { useTranslation } from 'react-i18next'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { Sharing } from '@/types/dto'
import { post } from '@/lib/fetch'
import * as dto from '@/types/dto'
import toast from 'react-hot-toast'
import { useState, useId, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { WorkspaceRole } from '@/types/workspace'
import { Badge } from '@/components/ui/badge'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
  CommandInput,
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
  if (sharing.length === 0) {
    return Mode.ONLYME
  } else if (sharing.find((s) => s.type === 'all')) {
    return Mode.ALL
  } else {
    return Mode.WORKSPACES
  }
}

export const AssistantSharingDialog = ({
  onClose,
  initialStatus,
  onSharingChange,
  assistantUrl,
}: Params) => {
  const { t } = useTranslation()
  const profile = useUserProfile()
  //const visibleWorkspaces = profile?.workspaces || []
  const visibleWorkspaces = [...(profile?.workspaces || [])]
  for (var i = 0; i < 20; i++) {
    visibleWorkspaces.push({
      id: 'wks_' + i,
      name: 'wks_' + i,
      role: WorkspaceRole.ADMIN,
    })
  }

  const [sharingState, setSharingState] = useState<Sharing[]>(initialStatus)
  const [mode, setMode] = useState<string>(deriveMode(initialStatus))
  const [open, setOpen] = useState(false)

  // unique, stable ids per instance
  const uid = useId()
  const idOnlyMe = `${uid}-onlyme`
  const idWorkspaces = `${uid}-workspaces`
  const idAll = `${uid}-all`

  // ensure keyboard nav works by focusing CommandInput on open
  const inputRef = useRef<HTMLInputElement | null>(null)

  const canShareWithWorkspace = (worskpaceMembership: dto.WorkspaceMembership): boolean => {
    return (
      worskpaceMembership.role === 'ADMIN' ||
      worskpaceMembership.role === 'OWNER' ||
      worskpaceMembership.role === 'EDITOR'
    )
  }

  const isSharedWithWorkspace = (workspaceId: string) => {
    return (
      sharingState.find((s) => s.type === 'workspace' && s.workspaceId === workspaceId) !==
      undefined
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
      (s) => s.type !== 'workspace' || s.workspaceId !== workspace.id
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
    if (value === 'all') {
      setSharingState([
        {
          type: 'all',
        } as dto.Sharing,
      ])
    } else {
      setSharingState([])
    }
  }
  const showWorkspaces = visibleWorkspaces.length !== 0 || mode === Mode.WORKSPACES
  const selectedWorkspaces = visibleWorkspaces.filter((w) => isSharedWithWorkspace(w.id))
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogHeader className="font-bold">{t('create-directory-connection')}</DialogHeader>
      <DialogContent className="flex flex-col">
        <DialogTitle>{t('sharing')}</DialogTitle>
        <RadioGroup value={mode} onValueChange={handleModeChange} className="flex flex-col gap-4">
          <div className="flex items-center space-x-2">
            <RadioGroupItem value={Mode.ONLYME} id={idOnlyMe} />
            <Label htmlFor={idOnlyMe} className="flex flex-col">
              <span>{t('only-me')}</span>
              <span className="text-sm text-muted-foreground">
                {t('only_you_will_have_access_to_this_assistant')}
              </span>
            </Label>
          </div>

          {showWorkspaces && (
            <div className="flex items-center space-x-2">
              <RadioGroupItem value={Mode.WORKSPACES} id={idWorkspaces} />
              <div className="flex-1">
                <Label htmlFor={idWorkspaces} className="flex flex-col">
                  <span>{t('share_with_workspace')}</span>
                  <span className="text-sm text-muted-foreground mb-2">
                    {t('share_with_one_or_more_workspaces')}
                  </span>
                </Label>
                {mode === 'workspaces' && (
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
                          {selectedWorkspaces.length === 0 ? (
                            <span className="px-2 text-muted-foreground">
                              {t('select_workspaces...')}
                            </span>
                          ) : (
                            selectedWorkspaces.map((workspace) => (
                              <Badge
                                key={workspace.id}
                                variant="secondary"
                                className="flex items-center gap-1 text-sm"
                              >
                                {workspace.name}
                              </Badge>
                            ))
                          )}
                        </div>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent
                      className="w-full p-0 w-[--radix-popover-trigger-width]"
                      onOpenAutoFocus={(e) => {
                        e.preventDefault()
                        inputRef.current?.focus()
                      }}
                    >
                      <Command loop>
                        <CommandInput
                          ref={inputRef}
                          placeholder={t('search_workspaces')}
                          className="h-9"
                        />
                        <CommandList className="max-h-64 overflow-y-auto">
                          <CommandEmpty>{t('no_workspace_found')}</CommandEmpty>
                          <CommandGroup>
                            {visibleWorkspaces.map((workspace) => (
                              <CommandItem
                                key={workspace.id}
                                value={workspace.name}
                                disabled={!canShareWithWorkspace(workspace as any)}
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
          )}

          <div className="flex items-center space-x-2">
            <RadioGroupItem disabled={profile?.role !== 'ADMIN'} value={Mode.ALL} id={idAll} />
            <Label htmlFor={idAll} className="flex flex-col">
              <span>{t('everyone_in_the_company')}</span>
              <span className="text-sm text-muted-foreground mb-2">
                {t('everyone_in_the_company_will_be_able_to_use_this_assistant')}
              </span>
            </Label>
          </div>
        </RadioGroup>
        <Button className="self-center" onClick={saveSharing}>
          {t('share')}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
