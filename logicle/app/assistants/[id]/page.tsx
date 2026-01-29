'use client'
import { WithLoadingAndError } from '@/components/ui'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { AssistantForm } from '../components/AssistantForm'
import * as dto from '@/types/dto'
import { get, patchWithSignal } from '@/lib/fetch'
import { AssistantPreview } from '../components/AssistantPreview'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/types/base'
import { IconArrowLeft, IconDotsVertical } from '@tabler/icons-react'
import { AssistantSharingDialog } from '../components/AssistantSharingDialog'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { RotatingLines } from 'react-loader-spinner'
import { post } from '@/lib/fetch'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuButton,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface State {
  assistant?: dto.AssistantDraft
  isLoading: boolean
  error?: ApiError
}

// Delay (ms) before auto-saving after last change
const AUTO_SAVE_DELAY = 5000

const AssistantPage = () => {
  const { id } = useParams() as { id: string }
  const { t } = useTranslation()
  const assistantUrl = `/api/assistants/${id}`
  const firePublish = useRef<(() => void) | undefined>(undefined)
  const [state, setState] = useState<State>({
    isLoading: false,
  })
  const [valid, setValid] = useState<boolean>(false)
  const [selectSharingVisible, setSelectSharingVisible] = useState<boolean>(false)
  const { assistant, isLoading, error } = state
  const sharing = assistant?.sharing || []
  const router = useRouter()
  const userProfile = useUserProfile()
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saving, setSaving] = useState(false)
  const [formResetKey, setFormResetKey] = useState(0)
  const modalContext = useConfirmationContext()
  const saveController = useRef<AbortController | null>(null)
  useEffect(() => {
    const doLoad = async () => {
      const response = await get<dto.AssistantDraft>(assistantUrl)
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
    if (state.assistant === undefined && !state.isLoading && !state.error) {
      setState({
        ...state,
        isLoading: true,
      })
      void doLoad()
    }
  }, [assistantUrl, id, state])

  function clearAutoSave() {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
  }

  function abortPendingSave() {
    clearAutoSave()
    if (saveController.current) {
      saveController.current.abort()
      saveController.current = null
    }
  }

  function scheduleAutoSave(assistant: dto.AssistantDraft) {
    clearAutoSave()
    saveTimeout.current = setTimeout(() => {
      void doSubmit(assistant)
    }, AUTO_SAVE_DELAY)
  }

  useEffect(() => {
    const handleBeforeUnload = async () => {
      if (assistant) await doSubmit(assistant)
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [assistant])

  async function onChange(values: dto.UpdateableAssistantDraft) {
    if (!assistant) {
      console.error("No assistant yet, can't handle onChange")
      return
    }
    const newState = {
      ...state,
      assistant: { ...assistant, ...values, pendingChanges: true },
    }
    setState(newState)
    scheduleAutoSave(newState.assistant)
  }

  async function onPublish(values: dto.UpdateableAssistantDraft) {
    const saved = await doSubmit(values)
    if (saved) {
      const response = await post(`${assistantUrl}/publish`)
      if (response.error) {
        toast.error(response.error.message)
      } else {
        toast.success(t('assistant-successfully-published'))
        if (assistant) {
          const newState = {
            ...state,
            assistant: { ...assistant, ...values, pendingChanges: false },
          }
          setState(newState)
        }
      }
    }
  }

  async function onChronology() {
    abortPendingSave()
    router.push(`/assistants/${id}/history`)
  }

  async function onCancelChanges() {
    const confirmed = await modalContext.askConfirmation({
      title: t('discard_changes_title'),
      message: t('discard_changes_message'),
      confirmMsg: t('discard_changes'),
    })
    if (!confirmed) return

    abortPendingSave()
    setSaving(true)
    try {
      const response = await post<dto.AssistantDraft>(`${assistantUrl}/reset-draft`)
      if (response.error) {
        toast.error(response.error.message)
        return
      }
      setState((prev) => ({
        ...prev,
        assistant: response.data,
      }))
      setFormResetKey((value) => value + 1)
      toast.success(t('changes_discarded'))
    } finally {
      setSaving(false)
    }
  }

  async function doSubmit(values: dto.UpdateableAssistantDraft): Promise<boolean> {
    abortPendingSave()
    setSaving(true)
    try {
      let assistantPatch: dto.UpdateableAssistantDraft = values
      if (assistantPatch.iconUri !== undefined) {
        let iconUri: string | null | undefined = assistantPatch.iconUri
        if (iconUri === '') {
          iconUri = null
        } else if (!iconUri?.startsWith('data')) {
          iconUri = undefined
        }
        assistantPatch = {
          ...assistantPatch,
          iconUri,
        }
      }

      const controller = new AbortController()
      saveController.current = controller
      const response = await patchWithSignal(
        assistantUrl,
        {
          ...assistantPatch,
          sharing: undefined,
          owner: undefined,
          provisioned: undefined,
        },
        controller.signal
      )
      if (response.error) {
        toast.error(response.error.message)
        return false
      }
      return true
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return false
      }
      throw error
    } finally {
      if (saveController.current) {
        saveController.current = null
      }
      setSaving(false)
    }
  }

  const setSharing = async (sharing: dto.Sharing[]) => {
    setState({
      ...state,
      assistant: {
        ...assistant!,
        sharing: sharing,
      },
    })
  }

  if (!assistant) {
    return (
      <WithLoadingAndError isLoading={isLoading} error={error}>
        {null}
      </WithLoadingAndError>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-center bg-muted p-2">
        <div className="flex justify-center items-center">
          <button type="button" title={t('back')} onClick={router.back}>
            <IconArrowLeft></IconArrowLeft>
          </button>
          <h1>{`${t('assistant')} ${assistant.name}`}</h1>
        </div>
        <div className="flex gap-3 items-center">
          <span>{assistant.pendingChanges ? t('unpublished_edits') : ''}</span>
          {
            <span className={saving ? 'visible' : 'invisible'}>
              <RotatingLines height="16" width="16"></RotatingLines>
            </span>
          }
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" rounded="full" title={t('options')}>
                <IconDotsVertical></IconDotsVertical>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent sideOffset={5}>
              <DropdownMenuButton
                disabled={!assistant.pendingChanges || saving}
                onClick={() => void onCancelChanges()}
              >
                {t('discard_changes')}
              </DropdownMenuButton>
              <DropdownMenuButton onClick={() => onChronology()}>
                {t('version_chronology')}
              </DropdownMenuButton>
            </DropdownMenuContent>
          </DropdownMenu>
          {assistant.owner === userProfile?.id && (
            <Button
              variant="outline"
              className="px-2"
              onClick={() => setSelectSharingVisible(true)}
            >
              {t('sharing')}
            </Button>
          )}
          <Button onClick={() => firePublish.current?.()}>
            {<span className="mr-1">{t('publish')}</span>}
          </Button>
        </div>
      </div>
      <div className={`flex-1 min-h-0 grid grid-cols-2 overflow-hidden`}>
        <AssistantForm
          key={`${assistant.id}-${formResetKey}`}
          assistant={assistant}
          onPublish={onPublish}
          onChange={onChange}
          onValidate={setValid}
          firePublish={firePublish}
        />
        <AssistantPreview
          sendDisabled={!valid}
          assistant={assistant}
          className="pl-4 h-full flex-1 min-w-0"
        ></AssistantPreview>
      </div>
      {selectSharingVisible && (
        <AssistantSharingDialog
          onClose={() => {
            setSelectSharingVisible(false)
          }}
          assistantUrl={assistantUrl}
          initialStatus={sharing}
          onSharingChange={setSharing}
        ></AssistantSharingDialog>
      )}
    </div>
  )
}

export default AssistantPage
