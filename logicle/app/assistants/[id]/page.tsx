'use client'
import { WithLoadingAndError } from '@/components/ui'
import { useParams, useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'next-i18next'
import { AssistantForm } from '../components/AssistantForm'
import * as dto from '@/types/dto'
import { get, patch, post } from '@/lib/fetch'
import { AssistantPreview } from '../components/AssistantPreview'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuButton,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { ApiError } from '@/types/base'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { IconArrowLeft } from '@tabler/icons-react'

interface State {
  assistant?: dto.SelectableAssistantWithTools
  isLoading: boolean
  error?: ApiError
}

const AssistantPage = () => {
  const { id } = useParams() as { id: string }
  const { t } = useTranslation('common')
  const profile = useUserProfile()
  const visibleWorkspaces = profile?.workspaces || []
  const assistantUrl = `/api/assistants/${id}`
  const fireSubmit = useRef<(() => void) | undefined>(undefined)
  const confirmationContext = useConfirmationContext()
  const [state, setState] = useState<State>({
    isLoading: true,
  })
  const { assistant, isLoading, error } = state
  const sharing = assistant?.sharing || []
  const router = useRouter()

  useEffect(() => {
    const doLoad = async () => {
      const stored = localStorage.getItem(id)
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as dto.SelectableAssistantWithTools
          if (
            await confirmationContext.askConfirmation({
              title: 'Found an unsaved version',
              message: 'Do you want to recover an unsaved version?',
              confirmMsg: 'Recover',
            })
          ) {
            setState({
              ...state,
              isLoading: false,
              assistant: parsed,
            })
          } else {
            localStorage.removeItem(id)
          }
        } catch {
          console.log('Failed recovering assistant from local storage')
        }
      }
      const response = await get<dto.SelectableAssistantWithTools>(assistantUrl)
      if (response.error) {
        setState({
          ...state,
          isLoading: false,
          error: response.error,
        })
      } else {
        setState({
          ...state,
          isLoading: false,
          assistant: response.data,
        })
      }
    }
    doLoad()
  }, [assistantUrl, confirmationContext, id, state])

  if (!assistant) {
    return (
      <WithLoadingAndError isLoading={isLoading} error={error}>
        <></>
      </WithLoadingAndError>
    )
  }

  async function onChange(values: Partial<dto.InsertableAssistant>) {
    setState({
      ...state,
      assistant: { ...assistant!, ...values },
    })
    localStorage.setItem(assistant!.id, JSON.stringify(assistant))
  }

  async function onSubmit(values: Partial<dto.InsertableAssistant>) {
    onChange(values)
    const response = await patch(assistantUrl, {
      ...assistant,
      ...values,
      sharing: undefined,
    })
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    localStorage.removeItem(assistant!.id)
    toast.success(t('assistant-successfully-updated'))
  }

  const shareWith = async (sharing: dto.InsertableSharing[]) => {
    const response = await post<dto.Sharing[]>(`${assistantUrl}/sharing`, sharing)
    if (response.error) {
      toast.error(response.error.message)
    } else {
      setState({
        ...state,
        assistant: {
          ...assistant!,
          sharing: response.data,
        },
      })
    }
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
    <div className="flex flex-col h-full overflow-hidden pl-4 pr-4">
      <div className="flex justify-between items-center">
        <div className="flex justify-center items-center">
          <button onClick={router.back}>
            <IconArrowLeft></IconArrowLeft>
          </button>
          <h1>{`Assistant ${assistant.name}`}</h1>
        </div>
        <div className="flex gap-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="px-2">
                {`Shared with ${dumpSharing(assistant.sharing)}`}
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
          assistant={assistant}
          onSubmit={onSubmit}
          onChange={onChange}
          fireSubmit={fireSubmit}
        />
        <AssistantPreview
          assistant={assistant}
          className="pl-4 h-full flex-1 min-w-0"
        ></AssistantPreview>
      </div>
    </div>
  )
}

export default AssistantPage
