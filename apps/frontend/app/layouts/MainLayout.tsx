'use client'
import { AppMenu } from '@/components/app/app-menu'
import {
  IconLayoutSidebarLeftCollapse,
  IconLayoutSidebarLeftExpand,
  IconMenu2,
  IconSatellite,
} from '@tabler/icons-react'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { MessageSquare, Compass, Images } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePathname } from 'next/navigation'
import { useLayoutConfig } from '@/components/providers/layoutconfigContext'
import { t } from 'i18next'
import { useEnvironment } from '../context/environmentProvider'
import { useSatellites } from '@/hooks/satellites'
import { useUserProfile } from '@/components/providers/userProfileContext'
import * as dto from '@/types/dto'

const SatelliteNavIcon: React.FC = () => {
  const userProfile = useUserProfile()
  const { data, isLoading } = useSatellites()
  const isAdmin = userProfile?.role === dto.UserRole.ADMIN
  if (!isAdmin && !isLoading && data.length === 0) return null
  return (
    <Link
      href="/satellites"
      title="Satellites"
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary-hover hover:text-foreground"
    >
      <IconSatellite size={20}></IconSatellite>
    </Link>
  )
}

export interface Props {
  leftBar?: React.ReactElement
  leftBarCollapsible: boolean
  children: React.ReactElement
}

const MobileLayout: React.FC<Props> = ({ leftBar, leftBarCollapsible, children }) => {
  const LeftBar = leftBar
  const [showDrawer, setShowDrawer] = useState<boolean>(false)
  const pathname = usePathname()

  // Selecting a conversation changes the route, but the chat shell remains
  // mounted. Close the drawer explicitly so it never obscures the new chat.
  useEffect(() => setShowDrawer(false), [pathname])

  return (
    <main className="flex h-[100dvh] min-h-0 w-full flex-col overflow-hidden text-sm">
      <header className="flex h-[calc(3.5rem+env(safe-area-inset-top))] shrink-0 items-center justify-between border-b px-2 pt-[env(safe-area-inset-top)]">
        <div className="flex items-center gap-1">
          {leftBarCollapsible && LeftBar && (
            <Button
              size="icon"
              variant="ghost"
              title={t('show-sidebar')}
              aria-label={t('show-sidebar')}
              onClick={() => setShowDrawer(true)}
            >
              <IconMenu2 size={24} />
            </Button>
          )}
          <Link
            href="/chat"
            title={t('goto-chats')}
            className="p-2"
            onClick={() => setShowDrawer(false)}
          >
            <MessageSquare size={22} />
          </Link>
        </div>
        <AppMenu chatOnly />
      </header>
      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">{children}</div>
      {LeftBar && (
        <Dialog.Root open={showDrawer} onOpenChange={setShowDrawer}>
          <Dialog.Portal>
            <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
            <Dialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[min(22rem,85vw)] flex-col overflow-hidden border-r bg-background p-0 pt-[env(safe-area-inset-top)] shadow-xl">
              <Dialog.Title className="sr-only">{t('show-sidebar')}</Dialog.Title>
              <Dialog.Close asChild>
                <Button
                  size="icon"
                  variant="ghost"
                  className="absolute right-2 top-2 z-10"
                  title={t('close')}
                  aria-label={t('close')}
                >
                  <span aria-hidden="true">×</span>
                </Button>
              </Dialog.Close>
              {leftBar}
            </Dialog.Content>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </main>
  )
}

const StandardLayout: React.FC<Props> = ({ leftBar, children }) => {
  const pathname = usePathname()
  const layoutconfigContext = useLayoutConfig()
  const environment = useEnvironment()
  const hideLeftBar = pathname === '/chat/assistants/select'
  const leftBarWidth = pathname.startsWith('/admin') ? 'w-[240px]' : 'w-[288px]'
  return (
    <main className="flex h-[100dvh] w-screen flex-row overflow-hidden bg-background text-sm">
      <div className="flex w-14 shrink-0 flex-col items-center justify-between border-r bg-background py-3">
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            title={t('show-sidebar')}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary-hover hover:text-foreground"
            onClick={() => layoutconfigContext.setShowSidebar(!layoutconfigContext.showSidebar)}
          >
            {layoutconfigContext.showSidebar ? (
              <IconLayoutSidebarLeftCollapse size={20}></IconLayoutSidebarLeftCollapse>
            ) : (
              <IconLayoutSidebarLeftExpand size={20}></IconLayoutSidebarLeftExpand>
            )}
          </button>
          <Link
            title={t('goto-chats')}
            href="/chat"
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              pathname.startsWith('/chat') && !pathname.startsWith('/chat/assistants')
                ? 'bg-primary-soft text-primary'
                : 'text-muted-foreground hover:bg-secondary-hover hover:text-foreground'
            }`}
          >
            <MessageSquare size={20}></MessageSquare>
          </Link>
          <Link
            title={t('select-assistant')}
            href="/chat/assistants/select"
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              pathname.startsWith('/chat/assistants')
                ? 'bg-primary-soft text-primary'
                : 'text-muted-foreground hover:bg-secondary-hover hover:text-foreground'
            }`}
          >
            <Compass size={20}></Compass>
          </Link>
          <Link
            title={t('images')}
            href="/images"
            className={`flex h-9 w-9 items-center justify-center rounded-lg transition-colors ${
              pathname.startsWith('/images')
                ? 'bg-primary-soft text-primary'
                : 'text-muted-foreground hover:bg-secondary-hover hover:text-foreground'
            }`}
          >
            <Images size={20}></Images>
          </Link>
          {environment.enableSatellitesUi && <SatelliteNavIcon />}
        </div>
        <div>
          <AppMenu />
        </div>
      </div>
      {leftBar && (
        <div
          className={`${
            layoutconfigContext.showSidebar ? `${leftBarWidth} opacity-1` : 'w-0 opacity-0'
          } transition-all duration-300 ease-in-out flex shrink-0 flex-col border-r bg-[hsl(var(--sidebar))] text-foreground overflow-hidden ${
            hideLeftBar ? 'hidden' : ''
          }`}
        >
          {leftBar}
        </div>
      )}
      {children}
    </main>
  )
}

export const MainLayout: React.FC<Props> = ({ leftBar, leftBarCollapsible, children }) => {
  const layoutconfigContext = useLayoutConfig()
  const isMobile = layoutconfigContext.isMobile
  if (isMobile) {
    return (
      <MobileLayout leftBar={leftBar} leftBarCollapsible={leftBarCollapsible}>
        {children}
      </MobileLayout>
    )
  } else {
    return (
      <StandardLayout leftBar={leftBar} leftBarCollapsible={leftBarCollapsible}>
        {children}
      </StandardLayout>
    )
  }
}
