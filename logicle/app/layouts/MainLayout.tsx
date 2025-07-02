'use client'
import { AppMenu } from '@/components/app/app-menu'
import { IconLayoutSidebarLeftExpand, IconMenu2 } from '@tabler/icons-react'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import * as Dialog from '@radix-ui/react-dialog'
import { MessageSquare, Compass } from 'lucide-react'

export interface Props {
  leftBar?: JSX.Element
  rightBar?: JSX.Element
  children: JSX.Element
}

import { Button } from '@/components/ui/button'
import { usePathname } from 'next/navigation'
import { useLayoutConfig } from '@/components/providers/layoutconfigContext'

/**
 * Modified from link below
 * @see https://observablehq.com/@werehamster/avoiding-hydration-mismatch-when-using-react-hooks
 * @param mediaQueryString
 * @returns {boolean}
 */
function useBetterMediaQuery(mediaQueryString): boolean {
  const [matches, setMatches] = useState<boolean>(undefined!)

  useEffect(() => {
    const mediaQueryList = window.matchMedia(mediaQueryString)
    const listener = () => setMatches(!!mediaQueryList.matches)
    listener()
    mediaQueryList.addEventListener('change', listener)
    return () => mediaQueryList.removeEventListener('change', listener)
  }, [mediaQueryString])

  return matches
}

export const MainLayout: React.FC<Props> = ({ leftBar, rightBar, children }) => {
  const LeftBar = leftBar
  const isMobile = useBetterMediaQuery('(max-width: 768px)')
  const [showDrawer, setShowDrawer] = useState<boolean>(false)
  const pathname = usePathname()
  const layoutconfigContext = useLayoutConfig()
  const hideLeftBar = pathname === '/chat/assistants/select' || !layoutconfigContext.showSidebar
  return (
    <main
      className={`"grid lg:grid-cols-5 flex h-screen w-screen flex-row text-sm overflow-hidden divide-x`}
    >
      <div className="flex flex-col justify-between align-center justify-center gap-3 p-2">
        <div className="flex flex-col flex-1 items-center gap-3">
          {isMobile && (
            <Button size="icon" variant="ghost" onClick={() => setShowDrawer(true)}>
              <IconMenu2 size={32}></IconMenu2>
            </Button>
          )}
          {layoutconfigContext.showSidebar == false && (
            <button onClick={() => layoutconfigContext.setShowSidebar(true)}>
              <IconLayoutSidebarLeftExpand size={28}></IconLayoutSidebarLeftExpand>
            </button>
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
      {leftBar && !isMobile && (
        <div
          className={`${
            layoutconfigContext.showSidebar ? 'w-[260px]' : 'w-0'
          } transition-width duration-1000 ease-in-out flex shrink-0 flex-col text-foreground overflow-hidden ${
            hideLeftBar ? 'hidden' : ''
          }`}
        >
          {leftBar}
        </div>
      )}
      {children}
      {rightBar && !isMobile && (
        <div className="w-[260px] flex shrink-0 text-foreground overflow-hidden">{rightBar}</div>
      )}
      {isMobile && LeftBar && (
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
