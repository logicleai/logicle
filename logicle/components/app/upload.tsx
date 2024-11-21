import { cn } from '@/lib/utils'
import { IconFile, IconX } from '@tabler/icons-react'
import { CircularProgressbar } from 'react-circular-progressbar'
import { Button } from '../ui/button'

export interface Upload {
  fileId: string // backend generated id
  fileName: string
  fileSize: number
  fileType: string
  progress: number
  done: boolean
}

interface UploadProps {
  file: Upload
  onDelete?: () => void
  className?: string
}

export const Upload = ({ file, className, onDelete }: UploadProps) => {
  return (
    <div
      key={file.fileId}
      className={cn('border p-2 flex flex-row items-center gap-2 relative', className)}
    >
      {onDelete && (
        <Button
          variant="secondary"
          size="icon"
          rounded="full"
          className="absolute right-0 top-0 shrink-0 translate-x-1/2 -translate-y-1/2"
          onClick={onDelete}
        >
          <IconX size="18"></IconX>
        </Button>
      )}
      <div className="shrink-0">
        {file.progress == 1 ? (
          <div className="bg-primary_color p-2 rounded">
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
          type = {file.fileType}
        </div>
      </div>
    </div>
  )
}

interface UploadListProps {
  files: Upload[]
  onDelete?: (id: string) => void
}

export const UploadList = ({ files, onDelete }: UploadListProps) => {
  if (files.length == 0) return <></>
  return (
    <div className="flex flex-row flex-wrap">
      {files.map((file) => {
        return (
          <Upload
            key={file.fileId}
            file={file}
            className="w-[250px] mt-2 mx-2"
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
