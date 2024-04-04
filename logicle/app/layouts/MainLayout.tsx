'use client'
import { AppMenu } from '@/components/app/app-menu'
import { IconGlobe, IconMenu2, IconMessage } from '@tabler/icons-react'
import Link from 'next/link'
import React, { useEffect, useState } from 'react'
import { useMediaQuery } from 'react-responsive'
import * as Dialog from '@radix-ui/react-dialog'

export interface Props {
  leftBar?: JSX.Element
  rightBar?: JSX.Element
  children: JSX.Element
}

import { Button } from '@/components/ui/button'
import UserProfileProvider from '@/components/providers/userProfileContext'
import { WorkspaceSelector } from '@/components/app/workspace-menu'
import { ActiveWorkspaceProvider } from '@/components/providers/activeWorkspaceContext'

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
  return (
    <UserProfileProvider>
      <ActiveWorkspaceProvider>
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
              <Link href="/chat">
                <IconMessage size={32}></IconMessage>
              </Link>
              <Link href="/chat/select_assistant">
                <IconGlobe size={32}></IconGlobe>
              </Link>
            </div>
            <div>
              <WorkspaceSelector />
              <AppMenu />
            </div>
          </div>
          {leftBar && !isMobile && (
            <div className="w-[260px] flex shrink-0 flex-col text-foreground overflow-hidden">
              {leftBar}
            </div>
          )}
          {children}
          {rightBar && !isMobile && (
            <div className="w-[260px] flex shrink-0 text-foreground overflow-hidden">
              {rightBar}
            </div>
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
      </ActiveWorkspaceProvider>
    </UserProfileProvider>
  )
}
