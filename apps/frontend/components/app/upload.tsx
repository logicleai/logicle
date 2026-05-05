import { cn } from '@/frontend/lib/utils'
import { IconDownload, IconFile, IconX } from '@tabler/icons-react'
import { CircularProgressbar } from 'react-circular-progressbar'
import { Button } from '../ui/button'
import { useTranslation } from 'react-i18next'
import { FileAnalysisPreview } from './fileAnalysisPreview'

export interface Upload {
  fileId: string // backend generated id
  fileName: string
  fileSize: number
  fileType: string
  progress: number
  done: boolean
  order: number // local UI ordering only
}

interface UploadProps {
  file: Upload
  onDownload?: () => void
  onDelete?: () => void
  className?: string
  disabled?: boolean
  modelId?: string
}

export const Upload = ({ file, className, onDownload, onDelete, disabled, modelId }: UploadProps) => {
  const { t } = useTranslation()
  return (
    <div className={cn('border p-2 flex flex-row items-center gap-2 relative group', className)}>
      {onDelete && !disabled && (
        <Button
          variant="secondary"
          size="icon"
          rounded="full"
          className="absolute right-0 top-0 shrink-0 translate-x-1/2 -translate-y-1/2"
          onClick={(evt) => {
            onDelete()
            evt.stopPropagation()
          }}
        >
          <IconX size="12" />
        </Button>
      )}
      {onDownload && (
        <Button
          variant="ghost"
          size="icon"
          rounded="full"
          className="absolute right-0 top-1/2 shrink-0 -translate-y-1/2 invisible group-hover:visible"
          onClick={(evt) => {
            onDownload()
            evt.stopPropagation()
          }}
        >
          <IconDownload className="m-2" size={18} color="gray"></IconDownload>
        </Button>
      )}
      <div className="shrink-0">
        {file.done ? (
          <div className="bg-primary p-2 rounded">
            <IconFile color="white" size="24"></IconFile>
          </div>
        ) : (
          <div className="m-2 w-[24px] h-[24px]">
            <CircularProgressbar value={file.progress * 100}></CircularProgressbar>
          </div>
        )}
      </div>
      <div className="overflow-hidden">
        <div className="flex-1 overflow-hidden whitespace-nowrap text-ellipsis">
          {file.fileName}
        </div>
        <div className="flex-1 overflow-hidden whitespace-nowrap text-ellipsis">
          {t('type')} = {file.fileType}
        </div>
        <FileAnalysisPreview fileId={file.fileId} done={file.done} modelId={modelId} />
      </div>
    </div>
  )
}

interface UploadListProps {
  files: Upload[]
  onDelete?: (id: string) => void
  modelId?: string
}

export const UploadList = ({ files, onDelete, modelId }: UploadListProps) => {
  if (files.length === 0) return null
  return (
    <div className="flex flex-row flex-wrap max-h-[400px] overflow-auto">
      {files.map((file) => {
        return (
          <Upload
            key={file.fileId}
            file={file}
            className="w-[250px] mt-2 mx-2"
            modelId={modelId}
            onDelete={
              onDelete
                ? () => {
                    onDelete?.(file.fileId)
                  }
                : undefined
            }
          />
        )
      })}
    </div>
  )
}
