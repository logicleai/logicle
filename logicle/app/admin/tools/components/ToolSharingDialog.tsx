import { useTranslation } from 'react-i18next'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { useUserProfile } from '@/components/providers/userProfileContext'
import * as dto from '@/types/dto'
import { SetStateAction, useState, useId } from 'react'
import { Button } from '@/components/ui/button'
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
  sharing: dto.Sharing2
  setSharing: (sharing: dto.Sharing2) => void
}

const PRIVATE: dto.PrivateSharing['type'] = 'private'
const PUBLIC: dto.PublicSharing['type'] = 'public'
const WORKSPACE: dto.WorkspaceSharing['type'] = 'workspace'

const toggleWorkspace = (
  sharing: dto.WorkspaceSharing,
  workspaceId: string,
  add: boolean
): dto.WorkspaceSharing => {
  const workspaces = sharing.workspaces.filter((w) => w !== workspaceId)
  if (add) {
    workspaces.push(workspaceId)
  }
  return {
    ...sharing,
    workspaces,
  }
}

export const ToolSharingDialog = ({ onClose, sharing, setSharing }: Params) => {
  const { t } = useTranslation()
  const profile = useUserProfile()
  const visibleWorkspaces = profile?.workspaces || []
  const [open, setOpen] = useState(false)

  // generate stable, unique ids for this instance
  const uid = useId()
  const idPrivate = `${uid}-private`
  const idWorkspace = `${uid}-workspace`
  const idPublic = `${uid}-public`

  const canShareWithWorkspace = (worskpaceMembership: dto.WorkspaceMembership): boolean => {
    return (
      worskpaceMembership.role === 'ADMIN' ||
      worskpaceMembership.role === 'OWNER' ||
      worskpaceMembership.role === 'EDITOR'
    )
  }

  const isSharedWithWorkspace = (workspaceId: string) => {
    return sharing.type === 'workspace' && sharing.workspaces.includes(workspaceId)
  }

  const handleModeChange = (value: SetStateAction<string>) => {
    if (value === PRIVATE) {
      setSharing({ type: 'private' })
    } else if (value === PUBLIC) {
      setSharing({ type: 'public' })
    } else {
      setSharing({ type: 'workspace', workspaces: [] })
    }
  }
  const showWorkspaces = visibleWorkspaces.length !== 0 || sharing.type === 'workspace'
  const selectedWorkspaces = visibleWorkspaces.filter((w) => isSharedWithWorkspace(w.id))
  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogHeader className="font-bold">{t('create-directory-connection')}</DialogHeader>
      <DialogContent className="flex flex-col">
        <DialogTitle>{t('sharing')}</DialogTitle>
        <RadioGroup
          value={sharing.type}
          onValueChange={handleModeChange}
          className="flex flex-col gap-4"
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value={'private'} id={idPrivate} />
            <Label htmlFor={idPrivate} className="flex flex-col">
              <span>{t('only-me')}</span>
              <span className="text-sm text-muted-foreground">
                {t('only_you_will_have_access_to_this_tool')}
              </span>
            </Label>
          </div>

          {showWorkspaces && (
            <div className="flex items-center space-x-2">
              <RadioGroupItem value={WORKSPACE} id={idWorkspace} />
              <div className="flex-1">
                <Label htmlFor={idWorkspace} className="flex flex-col">
                  <span>{t('share_tool_with_workspace')}</span>
                  <span className="text-sm text-muted-foreground mb-2">
                    {t('share_tool_with_one_or_more_workspaces')}
                  </span>
                </Label>
                {sharing.type === WORKSPACE && (
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
                                  setSharing(
                                    toggleWorkspace(
                                      sharing,
                                      workspace.id,
                                      !isSharedWithWorkspace(workspace.id)
                                    )
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
            <RadioGroupItem disabled={profile?.role !== 'ADMIN'} value={PUBLIC} id={idPublic} />
            <Label htmlFor={idPublic} className="flex flex-col">
              <span>{t('everyone_in_the_company')}</span>
              <span className="text-sm text-muted-foreground mb-2">
                {t('everyone_in_the_company_will_be_able_to_use_this_tool')}
              </span>
            </Label>
          </div>
        </RadioGroup>
      </DialogContent>
    </Dialog>
  )
}
