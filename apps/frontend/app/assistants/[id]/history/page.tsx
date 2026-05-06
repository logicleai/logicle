'use client'
import { useParams, useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useSWRJson } from '@/hooks/swr'
import { ScrollArea } from '@/components/ui/scroll-area'
import * as dto from '@/types/dto'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEffect, useState } from 'react'
import { get, patch } from '@/lib/fetch'
import { useTranslation } from 'react-i18next'
import { GeneralTabPanel } from '../../components/GeneralTabPanel'
import { SystemPromptTabPanel } from '../../components/SystemPromptTabPanel'
import { ToolsTabPanel } from '../../components/ToolsTabPanel'
import { KnowledgeTabPanel } from '../../components/KnowledgeTabPanel'
import { FormProvider, useForm } from 'react-hook-form'
import { FormFields, formSchema } from '../../components/AssistantFormField'
import { useEnvironment } from '@/app/context/environmentProvider'
import { useBackendsModels } from '@/hooks/backends'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  IconArrowLeft,
  IconDotsVertical,
  IconEdit,
  IconRotate,
} from '@tabler/icons-react'
import toast from 'react-hot-toast'
import { mutate } from 'swr'
import { AdvancedTabPanel } from '../../components/AdvancedTabPanel'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuButton, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

type TabState = 'general' | 'instructions' | 'tools' | 'knowledge' | 'advanced'

const AssistantHistoryEntry = ({ assistantVersion }: { assistantVersion: dto.AssistantDraft }) => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<TabState>('general')
  const environment = useEnvironment()
  const { data: models } = useBackendsModels()
  const backendModels = models || []

  const isToolCallingModel = (modelId: string) => {
    return environment.models.find((m) => m.id === modelId)?.capabilities.function_calling === true
  }

  const initialValues = {
    ...assistantVersion,
    model: {
      modelId: assistantVersion.model,
      backendId: assistantVersion.backendId,
    },
    subAssistants: assistantVersion.subAssistants ?? [],
  } as FormFields

  const resolver = zodResolver(formSchema)
  const form = useForm<FormFields>({
    resolver,
    values: initialValues,
    disabled: true,
  })

  return (
    <FormProvider {...form}>
      <div className="h-full overflow-hidden">
        <div
          onSubmit={(e) => e.preventDefault()}
          className="space-y-6 h-full flex flex-col p-2 overflow-hidden min-h-0 "
        >
          <div className="flex flex-row gap-1 self-center">
            <Tabs
              onValueChange={(value) => setActiveTab(value as TabState)}
              value={activeTab}
              className="space-y-4 h-full flex flex-col Tabs"
            >
              <TabsList>
                <TabsTrigger value="general">{t('general')}</TabsTrigger>
                <TabsTrigger value="instructions">{t('instructions')}</TabsTrigger>
                {isToolCallingModel(form.getValues().model.modelId) && (
                  <TabsTrigger value="tools">{t('tools')}</TabsTrigger>
                )}
                <TabsTrigger value="knowledge">{t('knowledge')}</TabsTrigger>
                <TabsTrigger value="advanced">{t('advanced')}</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <GeneralTabPanel
            className="flex-1 min-w-0"
            form={form}
            backendModels={backendModels}
            visible={activeTab === 'general'}
          />
          <SystemPromptTabPanel
            className="flex-1 min-h-0"
            form={form}
            visible={activeTab === 'instructions'}
          ></SystemPromptTabPanel>
          <ToolsTabPanel
            className="flex-1 min-w-0"
            form={form}
            visible={activeTab === 'tools'}
            assistantId={assistantVersion.assistantId}
          />
          <KnowledgeTabPanel className="flex-1" form={form} visible={activeTab === 'knowledge'} />
          <AdvancedTabPanel
            className="flex-1 min-w-0"
            form={form}
            visible={activeTab === 'advanced'}
          />
        </div>
      </div>
    </FormProvider>
  )
}

const AssistantHistory = () => {
  const { t } = useTranslation()
  const { id } = useParams() as { id: string }
  const url = `/api/assistants/${id}/history`
  const { data } = useSWRJson<dto.AssistantVersion[]>(url)
  const [assistantVersionId, setAssistantVersionId] = useState<string | undefined>()
  const [assistantVersion, setAssistantVersion] = useState<dto.AssistantDraft | undefined>()
  const [renameDialog, setRenameDialog] = useState<{
    versionId: string
    value: string
  } | null>(null)
  const assistantVersions = [...(data ?? [])].sort((a, b) => {
    return b.updatedAt.localeCompare(a.updatedAt)
  })
  const locale = 'en-US'
  const titleFormatter = new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
  const timestampFormatter = new Intl.DateTimeFormat(locale, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  const router = useRouter()
  useEffect(() => {
    const doLoad = async () => {
      if (assistantVersionId) {
        const assistantUrl = `/api/assistants/drafts/${assistantVersionId}`
        const response = await get<dto.AssistantDraft>(assistantUrl)
        if (response.error) {
          setAssistantVersion(undefined)
        } else {
          setAssistantVersion(response.data)
        }
      }
    }
    void doLoad()
  }, [assistantVersionId])

  useEffect(() => {
    if (!assistantVersionId) {
      const current = data?.find((d) => d.current)
      if (current) {
        setAssistantVersionId(current.id)
      }
    }
  }, [data, assistantVersionId])

  const onRestoreVersion = async () => {
    if (!assistantVersion) return
    const assistantUrl = `/api/assistants/${id}`
    let assistantPatch: dto.UpdateableAssistantDraft = assistantVersion
    if (assistantPatch.iconUri !== undefined) {
      let iconUri: string | null | undefined = assistantPatch.iconUri
      if (iconUri === '') {
        iconUri = null
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
      return false
    } else {
      toast.success(t('assistant_restored'))
      await mutate(url)
      return true
    }
  }

  const onRenameVersion = async () => {
    if (!renameDialog) return
    const nextVersionName = renameDialog.value.trim()
    const response = await patch(`/api/assistants/drafts/${renameDialog.versionId}`, {
      versionName: nextVersionName === '' ? null : nextVersionName,
    })
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    setRenameDialog(null)
    toast.success(t('version_name_updated'))
    await mutate(url)
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex justify-between items-center bg-muted p-2">
        <div className="flex justify-center items-center">
          <button type="button" title={t('back')} onClick={router.back}>
            <IconArrowLeft></IconArrowLeft>
          </button>
          <h1>{`${t('version_chronology')}`}</h1>
        </div>
        <div className="flex gap-3 items-center">
          <Button
            disabled={!assistantVersion}
            className="gap-2"
            variant="ghost"
            onClick={() => onRestoreVersion()}
          >
            <IconRotate />
            {<span className="mr-1">{t('restore_this_version')}</span>}
          </Button>
        </div>
      </div>
      <div className="flex h-full">
        <ScrollArea className="scroll-workaround h-full p-2 w-200">
          <ul className="space-y-3">
            {assistantVersions.map((assistantVersion) => {
              const updatedAt = new Date(assistantVersion.updatedAt)
              const isSelected = assistantVersion.id === assistantVersionId
              const versionName = assistantVersion.versionName?.trim() ?? ''
              const hasVersionName = versionName.length > 0

              return (
                <li key={assistantVersion.id ?? ''}>
                  <div
                    className={`group rounded-2xl border px-3 py-2 transition-colors ${
                      isSelected
                        ? 'bg-secondary-hover border-border shadow-sm'
                        : 'border-transparent hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        className="flex min-w-0 flex-1 flex-col overflow-hidden text-left"
                        onClick={() => setAssistantVersionId(assistantVersion.id)}
                      >
                        <span className="truncate text-2xl font-semibold leading-tight">
                          {hasVersionName ? versionName : titleFormatter.format(updatedAt)}
                        </span>
                        {hasVersionName ? (
                          <span className="mt-1 truncate text-sm text-muted-foreground">
                            {timestampFormatter.format(updatedAt)}
                          </span>
                        ) : null}
                        <span className="mt-3 flex items-center gap-2 text-sm">
                          {assistantVersion.current ? (
                            <span className="rounded-full bg-orange-100 px-2 py-0.5 text-orange-800">
                              {t('current_draft')}
                            </span>
                          ) : null}
                          {assistantVersion.published ? (
                            <span className="rounded-full bg-teal-100 px-2 py-0.5 text-teal-800">
                              {t('published')}
                            </span>
                          ) : null}
                        </span>
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                            title={t('rename_version')}
                          >
                            <IconDotsVertical />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuButton
                            icon={IconEdit}
                            onClick={() =>
                              setRenameDialog({
                                versionId: assistantVersion.id,
                                value: assistantVersion.versionName ?? '',
                              })
                            }
                          >
                            {t('rename_version')}
                          </DropdownMenuButton>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </ScrollArea>
        <div className="flex-1">
          {assistantVersion && (
            <AssistantHistoryEntry assistantVersion={assistantVersion}></AssistantHistoryEntry>
          )}
        </div>
      </div>
      <Dialog
        open={renameDialog !== null}
        onOpenChange={(open) => {
          if (!open) setRenameDialog(null)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('rename_version')}</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            value={renameDialog?.value ?? ''}
            placeholder={t('version_name_prompt')}
            onChange={(event) =>
              setRenameDialog((prev) => (prev ? { ...prev, value: event.target.value } : prev))
            }
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault()
                void onRenameVersion()
              }
            }}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRenameDialog(null)}>
              {t('cancel')}
            </Button>
            <Button onClick={() => void onRenameVersion()}>{t('save')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default AssistantHistory
