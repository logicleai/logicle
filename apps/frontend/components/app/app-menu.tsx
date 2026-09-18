'use client'
import { FC, createRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
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
import { cn } from '@/frontend/lib/utils'
import {
  IconCompass,
  IconLogout,
  IconPhoto,
  IconSatellite,
  IconSettings,
  IconUserCode,
} from '@tabler/icons-react'
import { IconUser } from '@tabler/icons-react'
import { Avatar } from '../ui/avatar'
import { useUserProfile } from '../providers/userProfileContext'
import * as dto from '@/types/dto'
import { UserDialog } from './UserDialog'
import { useRouter } from 'next/navigation'
import { useEnvironment } from '@/app/context/environmentProvider'
import { useSatellites } from '@/hooks/satellites'

type Params = {
  /** Mobile has no icon rail, so the menu also links to the sections the rail offers. */
  withNavigation?: boolean
}

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

const SatellitesMenuLink: FC = () => {
  const { t } = useTranslation()
  const userProfile = useUserProfile()
  const { data, isLoading } = useSatellites()
  const isAdmin = userProfile?.role === dto.UserRole.ADMIN
  if (!isAdmin && !isLoading && data.length === 0) return null
  return (
    <DropdownMenuLink href="/satellites" icon={IconSatellite}>
      {t('satellites')}
    </DropdownMenuLink>
  )
}

export const AppMenu: FC<Params> = ({ withNavigation = false }) => {
  const { t } = useTranslation()
  const dropdownContainer = createRef<HTMLDivElement>()
  const userProfile = useUserProfile()
  const userName = userProfile?.name
  const [showUserDialog, setShowUserDialog] = useState<boolean>(false)
  const router = useRouter()
  const environment = useEnvironment()
  const signOut = async () => {
    await fetch(`/api/auth/logout`, {
      method: 'post',
    })
    router.replace('/auth/login')
  }
  return (
    <div className="relative p-1 appmenu" ref={dropdownContainer}>
      <DropdownMenu>
        <DropdownMenuTrigger
          className="w-full"
          aria-label={t('my-profile')}
          title={t('my-profile')}
        >
          <span className="flex flex-row w-full items-center justify-center">
            <Avatar url={userProfile?.image ?? undefined} fallback={userName ?? ''} />
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {withNavigation && (
            <>
              <DropdownMenuLink href="/chat/assistants/select" icon={IconCompass}>
                {t('select-assistant')}
              </DropdownMenuLink>
              <DropdownMenuLink href="/images" icon={IconPhoto}>
                {t('images')}
              </DropdownMenuLink>
              {environment.enableSatellitesUi && <SatellitesMenuLink />}
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuButton icon={IconUser} onClick={async () => setShowUserDialog(true)}>
            {t('my-profile')}
          </DropdownMenuButton>
          <DropdownMenuLink href="/chat/assistants/mine" icon={IconUserCode}>
            {t('my-assistants')}
          </DropdownMenuLink>
          {userProfile?.role === dto.UserRole.ADMIN && (
            <DropdownMenuLink href="/admin/analytics" icon={IconSettings}>
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
      {showUserDialog && <UserDialog onClose={() => setShowUserDialog(false)}></UserDialog>}
    </div>
  )
}
