'use client'
import { AppMenu } from '@/components/app/app-menu'
import { IconLayoutSidebarLeftExpand, IconMenu2 } from '@tabler/icons-react'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { MessageSquare, Compass } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { usePathname } from 'next/navigation'
import { useLayoutConfig } from '@/components/providers/layoutconfigContext'
import { t } from 'i18next'

export interface Props {
  leftBar?: JSX.Element
  leftBarCollapsible: boolean
  children: JSX.Element
}

const MobileLayout: React.FC<Props> = ({ leftBar, leftBarCollapsible, children }) => {
  const LeftBar = leftBar
  const [showDrawer, setShowDrawer] = useState<boolean>(false)
  return (
    <main
      className={`"grid lg:grid-cols-5 flex h-screen w-screen flex-row text-sm overflow-hidden divide-x`}
    >
      <div className="flex flex-col justify-between align-center justify-center gap-3 p-2">
        <div className="flex flex-col flex-1 items-center gap-3">
          {leftBarCollapsible && (
            <Button size="icon" variant="ghost" onClick={() => setShowDrawer(true)}>
              <IconMenu2 size={32}></IconMenu2>
            </Button>
          )}
          <Link href="/chat">
            <MessageSquare size={28}></MessageSquare>
          </Link>
          <Link href="/chat/assistants/select">
            <Compass size={28}></Compass>
          </Link>
        </div>
        <div>
          <AppMenu />
        </div>
      </div>
      {children}
      {LeftBar && (
        <Dialog.Root open={showDrawer}>
          <Dialog.Portal>
            <Dialog.Overlay />
            <Dialog.Content
              className="border absolute left-0 top-0 bottom-0 md:w-[260px] w-[260px] max-w-[80%] md:max-w-[80%] overflow-hidden p-0 translate-x-[0%] translate-y-[0%] slide-in-from-left"
              onInteractOutside={() => setShowDrawer(false)}
              onPointerDownOutside={() => setShowDrawer(false)}
            >
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
  const hideLeftBar = pathname === '/chat/assistants/select'
  return (
    <main
      className={`"grid lg:grid-cols-5 flex h-screen w-screen flex-row text-sm overflow-hidden divide-x`}
    >
      <div className="flex flex-col justify-between align-center justify-center gap-3 p-2">
        <div className="flex flex-col flex-1 items-center gap-3">
          {!layoutconfigContext.showSidebar && (
            <button
              title={t('show_sidebar')}
              onClick={() => layoutconfigContext.setShowSidebar(true)}
            >
              <IconLayoutSidebarLeftExpand size={28}></IconLayoutSidebarLeftExpand>
            </button>
          )}
          <Link title={t('goto_chats')} href="/chat">
            <MessageSquare size={28}></MessageSquare>
          </Link>
          <Link title={t('select_assistant')} href="/chat/assistants/select">
            <Compass size={28}></Compass>
          </Link>
        </div>
        <div>
          <AppMenu />
        </div>
      </div>
      {leftBar && (
        <div
          className={`${
            layoutconfigContext.showSidebar ? 'w-[260px] opacity-1' : 'w-0 opacity-0'
          } transition-all duration-300 ease-in-out flex shrink-0 flex-col text-foreground overflow-hidden ${
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
