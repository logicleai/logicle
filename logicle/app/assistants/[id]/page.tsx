'use client'
import { WithLoadingAndError } from '@/components/ui'
import { useParams } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'
import { mutate } from 'swr'
import toast from 'react-hot-toast'
import { useTranslation } from 'next-i18next'
import { AssistantForm } from '../components/AssistantForm'
import * as dto from '@/types/dto'
import { patch, put } from '@/lib/fetch'
import { useSWRJson } from '@/hooks/swr'
import { ScrollArea } from '@/components/ui/scroll-area'
import { AssistantPreview } from '../components/AssistantPreview'
import { AdminPageTitle } from '@/app/admin/components/AdminPageTitle'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuButton,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUserProfile } from '@/components/providers/userProfileContext'

const AssistantPage = () => {
  const { id } = useParams() as { id: string }
  const { t } = useTranslation('common')
  const profile = useUserProfile()
  const visibleWorkspaces = profile?.workspaces || []
  const assistantUrl = `/api/assistants/${id}`
  const {
    data: loadedAssistant,
    error,
    isLoading,
  } = useSWRJson<dto.SelectableAssistantWithTools>(assistantUrl)
  const fireSubmit = useRef<(() => void) | undefined>(undefined)
  const [assistantState, setAssistantState] = useState<
    dto.SelectableAssistantWithTools | undefined
  >(undefined!)
  const sharing = loadedAssistant?.sharing || []

  useEffect(() => {
    loadedAssistant && setAssistantState(loadedAssistant)
  }, [loadedAssistant])

  async function onSubmit(assistant: Partial<dto.InsertableAssistant>) {
    const response = await patch(assistantUrl, {
      ...assistant,
      sharing: undefined,
    })
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    mutate(assistantUrl)
    toast.success(t('assistant-successfully-updated'))
  }

  const shareWith = async (sharing: dto.InsertableSharing[]) => {
    await put(`${assistantUrl}/sharing`, sharing)
    mutate(assistantUrl)
  }

  const isSharedWithWorkspace = (workspaceId: string) => {
    return sharing.find((s) => s.type == 'workspace' && s.workspaceId == workspaceId) != undefined
  }

  const isSharedWithAll = () => {
    return sharing.find((s) => s.type == 'all') != undefined
  }

  const toggleSharingWithAll = () => {
    if (isSharedWithAll()) {
      return sharing.filter((s) => s.type != 'all')
    } else {
      return [
        ...sharing,
        {
          type: 'all',
        } as dto.InsertableSharing,
      ]
    }
  }

  const toggleSharingWithWorkspace = (workspaceId: string) => {
    if (isSharedWithWorkspace(workspaceId)) {
      return sharing.filter((s) => s.type != 'workspace' || s.workspaceId != workspaceId)
    } else {
      return [
        ...sharing,
        {
          type: 'workspace',
          workspaceId: workspaceId,
        } as dto.InsertableSharing,
      ]
    }
  }

  const dumpSharing = (sharing: dto.Sharing[]) => {
    if (sharing.length == 0) {
      return 'none'
    } else {
      return sharing
        .map((sharing) => {
          if (sharing.type == 'workspace') {
            return sharing.workspaceName
          } else {
            return sharing.type
          }
        })
        .join('/')
    }
  }
  return (
    <WithLoadingAndError isLoading={isLoading} error={error}>
      {loadedAssistant && (
        <div className="flex flex-col h-full overflow-hidden pl-4 pr-4">
          <div className="flex justify-between items-center">
            <h1>{`Assistant ${loadedAssistant.name}`}</h1>
            <div className="flex gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" className="px-2">
                    {`Shared with ${dumpSharing(loadedAssistant.sharing)}`}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="" sideOffset={5}>
                  {visibleWorkspaces.map((workspace) => (
                    <DropdownMenuButton
                      disabled={workspace.role != 'ADMIN' && workspace.role != 'OWNER'}
                      checked={isSharedWithWorkspace(workspace.id)}
                      key={workspace.id}
                      onClick={() => shareWith(toggleSharingWithWorkspace(workspace.id))}
                    >
                      {workspace.name}
                    </DropdownMenuButton>
                  ))}
                  <DropdownMenuButton
                    disabled={profile?.role !== 'ADMIN'}
                    checked={isSharedWithAll()}
                    onClick={() => shareWith(toggleSharingWithAll())}
                  >
                    {t('all')}
                  </DropdownMenuButton>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={() => fireSubmit.current?.()}>Submit</Button>
            </div>
          </div>
          <div className={`flex-1 min-h-0 grid grid-cols-2 overflow-hidden`}>
            <AssistantForm
              assistant={loadedAssistant}
              onSubmit={onSubmit}
              onChange={(values) => setAssistantState({ ...loadedAssistant, ...values })}
              fireSubmit={fireSubmit}
            />
            <AssistantPreview
              assistant={assistantState ?? loadedAssistant}
              className="pl-4 h-full flex-1 min-w-0"
            ></AssistantPreview>
          </div>
        </div>
      )}
    </WithLoadingAndError>
  )
}

export default AssistantPage
