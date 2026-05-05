'use client'
import { WithLoadingAndError } from '@/components/ui'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuButton,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  getChangedAssistantDraftTopLevelFields,
  toUpdateableAssistantDraft,
  updateableAssistantDraftEqual,
} from '../components/draftUtils'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// Delay (ms) before auto-saving after last change
const AUTO_SAVE_DELAY = 5000
interface LocalConfirmationDialogState {
  title: string
  message: string | JSX.Element
  confirmMsg: string
  destructive?: boolean
}

const AssistantPage = () => {
  const { id } = useParams() as { id: string }
  const { t } = useTranslation()
  const assistantUrl = `/api/assistants/${id}`
  const firePublish = useRef<(() => void) | undefined>(undefined)
  const [assistant, setAssistant] = useState<dto.AssistantDraft | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<ApiError | undefined>(undefined)
  const [valid, setValid] = useState<boolean>(false)
  const [selectSharingVisible, setSelectSharingVisible] = useState<boolean>(false)
  const sharing = assistant?.sharing || []
  const router = useRouter()
  const userProfile = useUserProfile()
  const saveTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [saving, setSaving] = useState(false)
  const [formResetKey, setFormResetKey] = useState(0)
  const [savedAssistantSnapshot, setSavedAssistantSnapshot] = useState<
    dto.AssistantDraft | undefined
  >(undefined)
  const [tooltipChangedFieldKeys, setTooltipChangedFieldKeys] = useState<string[] | null>(null)
  const [confirmationDialog, setConfirmationDialog] =
    useState<LocalConfirmationDialogState | null>(null)
  const confirmationResolver = useRef<((confirmed: boolean) => void) | null>(null)
  const saveController = useRef<AbortController | null>(null)

  const loadDraftAndPublishedBaseline = useCallback(
    async (options?: { fullLoad?: boolean }): Promise<dto.AssistantDraft | undefined> => {
      if (options?.fullLoad) setIsLoading(true)
      const draftResponse = await get<dto.AssistantDraft>(assistantUrl)

      if (draftResponse.error) {
        setError(draftResponse.error)
        setAssistant(undefined)
        setSavedAssistantSnapshot(undefined)
        if (options?.fullLoad) setIsLoading(false)
        return undefined
      }

      setError(undefined)
      setAssistant(draftResponse.data)
      setSavedAssistantSnapshot(draftResponse.data)

      if (options?.fullLoad) setIsLoading(false)
      return draftResponse.data
    },
    [assistantUrl, id]
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const loaded = await loadDraftAndPublishedBaseline({ fullLoad: true })
      if (cancelled || !loaded) return
    })()
    return () => {
      cancelled = true
    }
  }, [loadDraftAndPublishedBaseline])

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

  const refreshChangedFieldKeys = useCallback(
    async (targetAssistant?: dto.AssistantDraft): Promise<string[]> => {
      const current = targetAssistant ?? assistant
      if (!current) return []

      const publishedResponse = await get<dto.UserAssistantWithSupportedMedia>(
        `/api/me/assistants/${id}`
      )
      if (publishedResponse.error) {
        const fallbackBaseline = savedAssistantSnapshot
        if (!fallbackBaseline) return []
        return getChangedAssistantDraftTopLevelFields(fallbackBaseline, current)
      }

      const publishedDraftResponse = await get<dto.AssistantDraft>(
        `/api/assistants/drafts/${publishedResponse.data.versionId}`
      )
      const baseline = publishedDraftResponse.error
        ? savedAssistantSnapshot ?? current
        : publishedDraftResponse.data
      return getChangedAssistantDraftTopLevelFields(baseline, current)
    },
    [assistant, id, savedAssistantSnapshot]
  )

  const askConfirmation = useCallback(
    (dialog: LocalConfirmationDialogState): Promise<boolean> => {
      setConfirmationDialog(dialog)
      return new Promise((resolve) => {
        confirmationResolver.current = resolve
      })
    },
    []
  )

  const resolveConfirmation = useCallback((confirmed: boolean) => {
    confirmationResolver.current?.(confirmed)
    confirmationResolver.current = null
    setConfirmationDialog(null)
  }, [])

  useEffect(() => {
    return () => {
      abortPendingSave()
    }
  }, [])

  const onChange = useCallback((values: dto.UpdateableAssistantDraft) => {
    setAssistant((prev) => {
      if (!prev) {
        console.error("No assistant yet, can't handle onChange")
        return prev
      }
      if (updateableAssistantDraftEqual(toUpdateableAssistantDraft(prev), values)) {
        return prev
      }
      setTooltipChangedFieldKeys(null)
      const nextAssistant = { ...prev, ...values, pendingChanges: true }
      scheduleAutoSave(nextAssistant)
      return nextAssistant
    })
  }, [])

  const onPublish = useCallback(async (values: dto.UpdateableAssistantDraft) => {
    const currentAssistant = assistant
    if (!currentAssistant) return
    const nextAssistant = { ...currentAssistant, ...values }
    const changedKeys = await refreshChangedFieldKeys(nextAssistant)
    const changedLabels = changedKeys.map((field) => changedFieldLabel(field))

    if (changedKeys.length === 0) {
      const discardConfirmed = await askConfirmation({
        title: t('publish_no_effective_changes_title'),
        message: (
          <div className="space-y-2">
            <div>{t('publish_no_effective_changes_message')}</div>
            <div className="text-sm text-muted-foreground">
              {t('publish_no_effective_changes_hint')}
            </div>
          </div>
        ),
        confirmMsg: t('discard_changes'),
      })
      if (discardConfirmed) {
        await discardCurrentDraft()
      }
      return
    }

    const publishConfirmed = await askConfirmation({
      title: t('publish_changes_title'),
      message: (
        <div className="space-y-2">
          <div>{t('publish_changes_message')}</div>
          <div>
            <div className="font-medium text-foreground">{t('changed_fields_title')}</div>
            <ul className="list-disc list-inside">
              {changedLabels.map((label) => (
                <li key={label}>{label}</li>
              ))}
            </ul>
          </div>
        </div>
      ),
      confirmMsg: t('publish'),
    })
    if (!publishConfirmed) return

    const saved = await doSubmit(values)
    if (saved) {
      const enteredVersionName = window.prompt(t('version_name_prompt'), '')
      if (enteredVersionName === null) {
        return
      }
      const response = await post(`${assistantUrl}/publish`, {
        versionName: enteredVersionName.trim() === '' ? null : enteredVersionName.trim(),
      })
      if (response.error) {
        toast.error(response.error.message)
      } else {
        toast.success(t('assistant-successfully-published'))
        clearAutoSave()
        setAssistant((prev) => {
          if (!prev) return prev
          const published = { ...prev, ...values, pendingChanges: false }
          setSavedAssistantSnapshot(published)
          setTooltipChangedFieldKeys([])
          return published
        })
      }
    }
  }, [assistant, assistantUrl, askConfirmation, refreshChangedFieldKeys, t])

  async function onChronology() {
    abortPendingSave()
    router.push(`/assistants/${id}/history`)
  }

  async function onCancelChanges() {
    const currentChangedFieldKeys = await refreshChangedFieldKeys()
    const changedFieldLabels = currentChangedFieldKeys.map((field) => changedFieldLabel(field))
    const confirmed = await askConfirmation({
      title: t('discard_changes_title'),
      message: (
        <div className="space-y-2">
          <div>
            {changedFieldLabels.length > 0
              ? t('discard_changes_message')
              : t('discard_no_effective_changes_message')}
          </div>
          {changedFieldLabels.length > 0 && (
            <div>
              <div className="font-medium text-foreground">{t('changed_fields_title')}</div>
              <ul className="list-disc list-inside">
                {changedFieldLabels.map((label) => (
                  <li key={label}>{label}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ),
      confirmMsg: t('discard_changes'),
    })
    if (!confirmed) return

    await discardCurrentDraft()
  }

  async function discardCurrentDraft() {
    abortPendingSave()
    setSaving(true)
    try {
      const response = await post<dto.AssistantDraft>(`${assistantUrl}/reset-draft`)
      if (response.error) {
        toast.error(response.error.message)
        return
      }
      setAssistant(response.data)
      setSavedAssistantSnapshot(response.data)
      setTooltipChangedFieldKeys([])
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
      await loadDraftAndPublishedBaseline()
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

  const setSharing = (sharing: dto.Sharing[]) => {
    setAssistant((prev) => (prev ? { ...prev, sharing } : prev))
  }

  const changedFieldLabel = (field: string) => {
    switch (field) {
      case 'name':
        return t('name')
      case 'description':
        return t('description')
      case 'model':
      case 'backendId':
        return t('model')
      case 'systemPrompt':
        return t('instructions')
      case 'tools':
        return t('tools')
      case 'files':
        return t('knowledge')
      case 'tags':
        return t('tags')
      case 'prompts':
        return t('prompts')
      case 'temperature':
        return t('temperature')
      case 'tokenLimit':
        return t('token-limit')
      case 'reasoning_effort':
        return t('reasoning')
      case 'iconUri':
        return t('assistant_icon')
      case 'subAssistants':
        return t('sub_assistants')
      default:
        return field
    }
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
          {assistant.pendingChanges ? (
            <TooltipProvider delayDuration={150}>
              <Tooltip
                onOpenChange={(open) => {
                  if (open) {
                    setTooltipChangedFieldKeys(null)
                    void refreshChangedFieldKeys().then((keys) => {
                      setTooltipChangedFieldKeys(keys)
                    })
                  }
                }}
              >
                <TooltipTrigger asChild>
                  <span className="cursor-help underline decoration-dotted underline-offset-2">
                    {t('unpublished_edits')}
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-80">
                  <div className="space-y-1">
                    <div className="font-medium">{t('changed_fields_title')}</div>
                    {tooltipChangedFieldKeys === null ? (
                      <div>{t('changed_fields_loading')}</div>
                    ) : tooltipChangedFieldKeys.length > 0 ? (
                      <ul className="list-disc list-inside">
                        {tooltipChangedFieldKeys.map((field) => (
                          <li key={field}>{changedFieldLabel(field)}</li>
                        ))}
                      </ul>
                    ) : (
                      <div>{t('no_effective_draft_changes')}</div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          ) : (
            ''
          )}
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
      {confirmationDialog && (
        <AlertDialog open={true}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{confirmationDialog.title}</AlertDialogTitle>
            </AlertDialogHeader>
            <div className="text-center text-muted-foreground">{confirmationDialog.message}</div>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => resolveConfirmation(false)}>
                {t('cancel')}
              </AlertDialogCancel>
              <AlertDialogAction
                variant={confirmationDialog.destructive ? 'destructive' : undefined}
                onClick={() => resolveConfirmation(true)}
              >
                {confirmationDialog.confirmMsg}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}

export default AssistantPage
