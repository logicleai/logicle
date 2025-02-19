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
import { AssistantSharingDialog } from '../components/AssistantSharingDialog'
import { useUserProfile } from '@/components/providers/userProfileContext'

interface State {
  assistant?: dto.AssistantWithTools
  isLoading: boolean
  error?: ApiError
}

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
  useEffect(() => {
    const doLoad = async () => {
      const stored = localStorage.getItem(id)
      if (stored) {
        try {
          const parsed = JSON.parse(stored) as dto.AssistantWithTools
          if (
            await confirmationContext.askConfirmation({
              title: t('found_an_unsaved_version'),
              message: t('do_you_want_to_recover_an_unsaved_version'),
              confirmMsg: t('recover'),
            })
          ) {
            setState({
              ...state,
              isLoading: false,
              assistant: parsed,
            })
            return
          } else {
            localStorage.removeItem(id)
          }
        } catch {
          console.warn('Failed recovering assistant from local storage')
        }
      }
      const response = await get<dto.AssistantWithTools>(assistantUrl)
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

  async function onChange(values: Partial<dto.InsertableAssistant>) {
    const newState = {
      ...state,
      assistant: { ...assistant!, ...values },
    }

    setState(newState)
    localStorage.setItem(assistant!.id, JSON.stringify(values))
  }

  async function onSubmit(values: Partial<dto.InsertableAssistant>) {
    await onChange(values)
    if (!values?.iconUri?.startsWith('data')) {
      values = {
        ...values,
        iconUri: undefined,
      }
    }
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
              {t('sharing')}
            </Button>
          )}
          <Button onClick={() => fireSubmit.current?.()}>{t('submit')}</Button>
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
