'use client'
import { WithLoadingAndError } from '@/components/ui'
import { useParams, useRouter } from 'next/navigation'
import React, { useEffect, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { AssistantForm } from '../components/AssistantForm'
import * as dto from '@/types/dto'
import { get, patch } from '@/lib/fetch'
import { AssistantPreview } from '../components/AssistantPreview'
import { Button } from '@/components/ui/button'
import { ApiError } from '@/types/base'
import { useConfirmationContext } from '@/components/providers/confirmationContext'
import { IconArrowLeft } from '@tabler/icons-react'
import { AssistantPublishDialog } from '../components/AssistantPublishDialog'
import { useUserProfile } from '@/components/providers/userProfileContext'
import { RotatingLines } from 'react-loader-spinner'

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
  const fireSubmit = useRef<(() => void) | undefined>(undefined)
  const confirmationContext = useConfirmationContext()
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
  }, [assistantUrl, confirmationContext, id, state])

  function clearAutoSave() {
    if (saveTimeout.current) clearTimeout(saveTimeout.current)
  }

  function scheduleAutoSave(assistant: dto.AssistantDraft) {
    clearAutoSave()
    saveTimeout.current = setTimeout(() => {
      void onSubmit(assistant)
    }, AUTO_SAVE_DELAY)
  }

  useEffect(() => {
    const handleBeforeUnload = async (e: BeforeUnloadEvent) => {
      if (assistant) await onSubmit(assistant)
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload)
    }
  }, [assistant])

  async function onChange(values: dto.UpdateableAssistant) {
    if (!assistant) {
      console.error("No assistant yet, can't handle onChange")
      return
    }
    const newState = {
      ...state,
      assistant: { ...assistant, ...values },
    }
    setState(newState)
    scheduleAutoSave(newState.assistant)
  }

  async function onSubmit(values: dto.UpdateableAssistant) {
    clearAutoSave()
    setSaving(true)
    try {
      let assistantPatch: dto.UpdateableAssistant = values
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

      const response = await patch(assistantUrl, {
        ...assistantPatch,
        sharing: undefined,
        owner: undefined,
        provisioned: undefined,
      })
      if (response.error) {
        toast.error(response.error.message)
        return
      }
    } finally {
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
        <></>
      </WithLoadingAndError>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-center bg-muted p-2">
        <div className="flex justify-center items-center">
          <button onClick={router.back}>
            <IconArrowLeft></IconArrowLeft>
          </button>
          <h1>{`${t('assistant')} ${assistant.name}`}</h1>
        </div>
        <div className="flex gap-3">
          {assistant.owner == userProfile?.id && (
            <Button
              variant="outline"
              className="px-2"
              onClick={() => setSelectSharingVisible(true)}
            >
              {t('publish')}
            </Button>
          )}
          <Button onClick={() => fireSubmit.current?.()}>
            {<span className="mr-1">{t('save')}</span>}
            {
              <span className={saving ? 'visible' : 'invisible'}>
                <RotatingLines width="12" strokeColor="white"></RotatingLines>
              </span>
            }
          </Button>
        </div>
      </div>
      <div className={`flex-1 min-h-0 grid grid-cols-2 overflow-hidden`}>
        <AssistantForm
          assistant={assistant}
          onSubmit={onSubmit}
          onChange={onChange}
          onValidate={setValid}
          fireSubmit={fireSubmit}
        />
        <AssistantPreview
          sendDisabled={!valid}
          assistant={assistant}
          className="pl-4 h-full flex-1 min-w-0"
        ></AssistantPreview>
      </div>
      {selectSharingVisible && (
        <AssistantPublishDialog
          onClose={() => {
            setSelectSharingVisible(false)
          }}
          assistantUrl={assistantUrl}
          initialStatus={sharing}
          onSharingChange={setSharing}
        ></AssistantPublishDialog>
      )}
    </div>
  )
}

export default AssistantPage
