'use client'
import { signOut } from 'next-auth/react'
import { FC, createRef } from 'react'
import { useTranslation } from 'next-i18next'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuButton,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuLink,
} from '@/components/ui/dropdown-menu'
import React from 'react'

import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu'
import { cn } from '@/lib/utils'
import { useSWRJson } from '@/hooks/swr'
import { SelectableUserDTO, UserRoleName } from '@/types/user'
import { IconLogout, IconSettings } from '@tabler/icons-react'
import { IconUser } from '@tabler/icons-react'
import { Avatar } from '../ui/avatar'

interface Params {}

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

export const AppMenu: FC<Params> = () => {
  const { t } = useTranslation('common')
  const dropdownContainer = createRef<HTMLDivElement>()
  const { data: user } = useSWRJson<SelectableUserDTO>(`/api/user/profile`)
  const userName = user?.name
  return (
    <div className="relative p-1 appmenu" ref={dropdownContainer}>
      <DropdownMenu>
        <DropdownMenuTrigger className="w-full">
          <div className="flex flex-row w-full items-center justify-center">
            <Avatar url={user?.image ?? undefined} fallback={userName ?? ''} />
          </div>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLink href="/profile" icon={IconUser}>
            {t('my-profile')}
          </DropdownMenuLink>
          {user?.role == UserRoleName.ADMIN && (
            <DropdownMenuLink href="/admin/assistants" icon={IconSettings}>
              {t('administrator-settings')}
            </DropdownMenuLink>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuButton
            variant="destructive"
            onClick={async () => await signOut()}
            icon={IconLogout}
          >
            {t('logout')}
          </DropdownMenuButton>
        </DropdownMenuContent>
        <DropdownMenuPortal container={dropdownContainer.current}></DropdownMenuPortal>
      </DropdownMenu>
    </div>
  )
}
