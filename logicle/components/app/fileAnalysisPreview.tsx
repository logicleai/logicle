import * as dto from '@/types/dto'
import type { TFunction } from 'i18next'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { getFileAnalysis } from '@/services/files'

const getSummary = (analysis: dto.FileAnalysis, t: TFunction) => {
  if (analysis.status !== 'ready' || !analysis.payload) {
    return null
  }

  switch (analysis.payload.kind) {
    case 'pdf':
      return t('file_analysis_pdf_summary', {
        pageCount: analysis.payload.pageCount,
        contentMode: analysis.payload.contentMode,
      })
    case 'image':
      return t('file_analysis_image_summary', {
        width: analysis.payload.width,
        height: analysis.payload.height,
      })
    case 'spreadsheet':
      return t('file_analysis_spreadsheet_summary', {
        sheetCount: analysis.payload.sheetCount,
      })
    case 'presentation':
      return t('file_analysis_presentation_summary', {
        slideCount: analysis.payload.slideCount,
      })
    case 'word':
      return t('file_analysis_word_summary', {
        textCharCount: analysis.payload.textCharCount,
      })
    default:
      return null
  }
}

const getWarning = (analysis: dto.FileAnalysis, t: TFunction) => {
  if (analysis.status !== 'ready' || !analysis.payload) {
    return null
  }
  if (analysis.payload.kind === 'pdf' && analysis.payload.pageCount > 100) {
    return t('file_analysis_pdf_claude_too_large_warning')
  }
  return null
}

const getStatusLabel = (analysis: dto.FileAnalysis, t: TFunction) => {
  switch (analysis.status) {
    case 'pending':
    case 'processing':
      return t('file_analysis_in_progress')
    case 'failed':
      return t('file_analysis_failed')
    default:
      return null
  }
}

export const FileAnalysisPreview = ({ fileId, done }: { fileId: string; done: boolean }) => {
  const { t } = useTranslation()
  const [analysis, setAnalysis] = useState<dto.FileAnalysis | null>(null)

  useEffect(() => {
    if (!done) {
      setAnalysis(null)
      return
    }

    let mounted = true
    let timeoutId: ReturnType<typeof setTimeout> | undefined

    setAnalysis({
      fileId,
      kind: 'unknown',
      status: 'pending',
      analyzerVersion: null,
      payload: null,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    })

    const scheduleRetry = () => {
      timeoutId = setTimeout(() => {
        void poll()
      }, 1000)
    }

    const poll = async () => {
      const response = await getFileAnalysis(fileId)
      if (!mounted) {
        return
      }

      if (response.error || !response.data) {
        scheduleRetry()
        return
      }

      setAnalysis(response.data)

      if (response.data.status === 'pending' || response.data.status === 'processing') {
        scheduleRetry()
      }
    }

    void poll()

    return () => {
      mounted = false
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [done, fileId])

  if (!done || !analysis) {
    return null
  }

  const statusLabel = getStatusLabel(analysis, t)
  const summary = getSummary(analysis, t)
  const warning = getWarning(analysis, t)

  if (!statusLabel && !summary && !warning) {
    return null
  }

  return (
    <div className="mt-1 space-y-1">
      {statusLabel && <div className="text-xs text-muted-foreground">{statusLabel}</div>}
      {summary && <div className="text-xs text-muted-foreground">{summary}</div>}
      {warning && (
        <div className="rounded border border-amber-300 bg-amber-50 px-2 py-1 text-xs text-amber-900">
          {warning}
        </div>
      )}
    </div>
  )
}
