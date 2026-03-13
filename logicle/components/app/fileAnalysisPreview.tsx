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

const getStatusLabel = (analysis: dto.FileAnalysis, t: TFunction) => {
  if (analysis.status === 'failed') {
    return t('file_analysis_failed')
  }
  return null
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

    const fetch = async () => {
      const response = await getFileAnalysis(fileId)
      if (mounted && response.data) {
        setAnalysis(response.data)
      }
    }

    void fetch()

    return () => {
      mounted = false
    }
  }, [done, fileId])

  if (!done || !analysis) {
    return null
  }

  const statusLabel = getStatusLabel(analysis, t)
  const summary = getSummary(analysis, t)

  if (!statusLabel && !summary) {
    return null
  }

  return (
    <div className="mt-1 space-y-1">
      {statusLabel && <div className="text-xs text-muted-foreground">{statusLabel}</div>}
      {summary && <div className="text-xs text-muted-foreground">{summary}</div>}
    </div>
  )
}
