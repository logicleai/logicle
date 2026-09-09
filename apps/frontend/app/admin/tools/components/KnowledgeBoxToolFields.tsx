'use client'

import { FC } from 'react'
import { useTranslation } from 'react-i18next'
import { UseFormReturn } from 'react-hook-form'
import { IconPlus, IconRefresh, IconTrash } from '@tabler/icons-react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { FormItem } from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { post } from '@/lib/fetch'
import type { KnowledgeBoxQuestion } from '@/lib/tools/schemas'
import * as dto from '@/types/dto'
import { useKnowledgeBoxStatus } from '@/hooks/knowledgeBox'
import { ToolFormFields } from './toolFormTypes'

interface Props {
  form: UseFormReturn<ToolFormFields>
  toolId?: string
}

const newQuestionId = () => `q-${Math.random().toString(36).slice(2, 10)}`

const readQuestions = (configuration: Record<string, unknown>): KnowledgeBoxQuestion[] =>
  Array.isArray(configuration.questions) ? (configuration.questions as KnowledgeBoxQuestion[]) : []

const statusLabel = (status: dto.KnowledgeBoxDocumentStatus | undefined) =>
  status ? status.status : 'not indexed'

/**
 * Configuration for a `knowledge_box` tool: the questions asked to every document at ingestion
 * time, plus the resulting per-document ingestion state. Files themselves are managed by the
 * shared `ToolKnowledgeSection`, which the parent form renders alongside this component.
 */
export const KnowledgeBoxToolFields: FC<Props> = ({ form, toolId }) => {
  const { t } = useTranslation()
  const { data: status, mutate: refreshStatus } = useKnowledgeBoxStatus(toolId)

  const configuration = form.watch('configuration') ?? {}
  const questions = readQuestions(configuration)
  const files = form.watch('files') ?? []

  const setQuestions = (next: KnowledgeBoxQuestion[]) => {
    form.setValue('configuration', { ...configuration, questions: next }, { shouldDirty: true })
  }

  const addQuestion = () => {
    setQuestions([...questions, { id: newQuestionId(), title: '', prompt: '' }])
  }

  const updateQuestion = (index: number, patch: Partial<KnowledgeBoxQuestion>) => {
    setQuestions(
      questions.map((question, i) => (i === index ? { ...question, ...patch } : question))
    )
  }

  const removeQuestion = (index: number) => {
    setQuestions(questions.filter((_, i) => i !== index))
  }

  const reindex = async () => {
    if (!toolId) return
    const response = await post(`/api/tools/${toolId}/knowledge-box`)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    toast.success(t('knowledge-box-reindex-queued'))
    await refreshStatus()
  }

  const statusByFile = new Map((status?.documents ?? []).map((entry) => [entry.fileId, entry]))

  return (
    <>
      <FormItem label={t('knowledge-box-questions')}>
        <div className="flex flex-col gap-3">
          <p className="text-sm opacity-70">{t('knowledge-box-questions-description')}</p>
          {questions.map((question, index) => (
            <div key={question.id} className="flex flex-col gap-2 rounded border p-3">
              <div className="flex items-center gap-2">
                <Input
                  value={question.title}
                  placeholder={t('knowledge-box-question-title-placeholder')}
                  onChange={(evt) => updateQuestion(index, { title: evt.target.value })}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeQuestion(index)}
                  aria-label={t('remove')}
                >
                  <IconTrash size={18} />
                </Button>
              </div>
              <Textarea
                value={question.prompt}
                placeholder={t('knowledge-box-question-prompt-placeholder')}
                onChange={(evt) => updateQuestion(index, { prompt: evt.target.value })}
              />
            </div>
          ))}
          <div>
            <Button type="button" variant="secondary" onClick={addQuestion}>
              <IconPlus size={18} />
              {t('knowledge-box-add-question')}
            </Button>
          </div>
        </div>
      </FormItem>

      {toolId && (
        <FormItem label={t('knowledge-box-indexing-status')}>
          <div className="flex flex-col gap-2">
            {files.length === 0 && <p className="text-sm opacity-70">{t('no-files')}</p>}
            {files.map((file) => {
              const entry = statusByFile.get(file.id)
              return (
                <div key={file.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate">{file.name}</span>
                  <span className="shrink-0 opacity-70">
                    {statusLabel(entry)}
                    {entry?.status === 'ready' &&
                      ` · ${entry.chunkCount} chunks · ${entry.projectionCount} answers`}
                    {entry?.error && ` · ${entry.error}`}
                  </span>
                </div>
              )
            })}
            <div>
              <Button type="button" variant="secondary" onClick={reindex}>
                <IconRefresh size={18} />
                {t('knowledge-box-reindex')}
              </Button>
            </div>
          </div>
        </FormItem>
      )}
    </>
  )
}

export default KnowledgeBoxToolFields
