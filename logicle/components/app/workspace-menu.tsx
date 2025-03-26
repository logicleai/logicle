'use client'
import { FC, createRef } from 'react'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuButton,
  DropdownMenuPortal,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import React from 'react'

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'
import { IconUsersGroup } from '@tabler/icons-react'
import { useUserProfile } from '../providers/userProfileContext'
import { useActiveWorkspace } from '../providers/activeWorkspaceContext'
import { LetterAvatar } from '../ui'
import { useTranslation } from 'react-i18next'

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type */
interface WorkspaceSelectorParams {}

const DropdownMenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <DropdownMenuPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      'z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 text-link',
      className
    )}
    {...props}
  />
))
DropdownMenuContent.displayName = DropdownMenuPrimitive.Content.displayName

DropdownMenuContent.displayName = 'DropdownMenuContent'

export const WorkspaceSelector: FC<WorkspaceSelectorParams> = () => {
  const dropdownContainer = createRef<HTMLDivElement>()
  const userProfile = useUserProfile()
  const enabledWorkspaces = userProfile?.workspaces ?? []
  const workspaceContext = useActiveWorkspace()
  const { t } = useTranslation()
  return (
    <div className="relative p-1 appmenu" ref={dropdownContainer}>
      <DropdownMenu>
        <DropdownMenuTrigger className="w-full">
          <div className="flex flex-row w-full items-center justify-center">
            <LetterAvatar
              fill={workspaceContext.workspace ? undefined : 'transparent'}
              border={workspaceContext.workspace ? undefined : '1px solid #d0d0d0'}
              color={workspaceContext.workspace ? undefined : 'gray'}
              name={workspaceContext.workspace?.name ?? '. . .'}
            />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {enabledWorkspaces.map((w) => (
            <DropdownMenuButton
              key={w.id}
              onClick={async () => {
                await workspaceContext.selectWorkspace(w)
              }}
              icon={IconUsersGroup}
            >
              {w.name}
            </DropdownMenuButton>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuButton
            key="none"
            onClick={async () => {
              await workspaceContext.selectWorkspace(undefined)
            }}
            icon={IconUsersGroup}
          >
            {t('none')}
          </DropdownMenuButton>
        </DropdownMenuContent>
        <DropdownMenuPortal container={dropdownContainer.current}></DropdownMenuPortal>
      </DropdownMenu>
    </div>
  )
}
