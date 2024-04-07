'use client'
import { WithLoadingAndError } from '@/components/ui'
import { useParams } from 'next/navigation'
import React, { useEffect, useState } from 'react'
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
import { useActiveWorkspace } from '@/components/providers/activeWorkspaceContext'
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
  const [assistantState, setAssistantState] = useState<
    dto.SelectableAssistantWithTools | undefined
  >(undefined!)

  useEffect(() => {
    loadedAssistant && setAssistantState(loadedAssistant)
  }, [loadedAssistant])

  async function onSubmit(assistant: Partial<dto.InsertableAssistant>) {
    const response = await patch(assistantUrl, assistant)
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

  const toggleWorkspace = (sharing: dto.InsertableSharing[], workspaceId: string) => {
    let workspaceIds = sharing.flatMap((s) => (s.type == 'workspace' ? [s.workspaceId] : []))
    if (workspaceIds.includes(workspaceId)) {
      workspaceIds = workspaceIds.filter((w) => w != workspaceId)
    } else {
      workspaceIds.push(workspaceId)
    }
    return workspaceIds.map((w) => {
      return {
        type: 'workspace',
        workspaceId: w,
      } as dto.InsertableSharing
    })
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
        <div className="flex flex-col h-full overflow-hidden">
          <AdminPageTitle title={`Assistant ${loadedAssistant.name}`}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="px-2">
                  Shared with <>{dumpSharing(loadedAssistant.sharing)}</>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="" sideOffset={5}>
                <DropdownMenuButton onClick={() => shareWith([])}>{t('none')}</DropdownMenuButton>
                {visibleWorkspaces.map((workspace) => (
                  <DropdownMenuButton
                    onClick={() =>
                      shareWith(toggleWorkspace(loadedAssistant.sharing, workspace.id))
                    }
                  >
                    {workspace.name}
                  </DropdownMenuButton>
                ))}
                <DropdownMenuButton onClick={() => shareWith([{ type: 'all' }])}>
                  {t('all')}
                </DropdownMenuButton>
              </DropdownMenuContent>
            </DropdownMenu>
          </AdminPageTitle>
          <div className={`flex-1 min-h-0 grid grid-cols-2`}>
            <ScrollArea className="h-full flex-1 min-w-0 pr-2">
              <AssistantForm
                assistant={loadedAssistant}
                onSubmit={onSubmit}
                onChange={(values) => setAssistantState({ ...loadedAssistant, ...values })}
              />
            </ScrollArea>
            <AssistantPreview
              assistant={assistantState ?? loadedAssistant}
              className="pl-2 h-full flex-1 min-w-0"
            ></AssistantPreview>
          </div>
        </div>
      )}
    </WithLoadingAndError>
  )
}

export default AssistantPage
