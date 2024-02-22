import { cn } from '@/lib/utils'
import { IconPaperclip } from '@tabler/icons-react'
import { CircularProgressbar } from 'react-circular-progressbar'

export interface Upload {
  fileId: string // backend generated id
  fileName: string
  fileSize: number
  fileType: string
  progress: number
}

interface UploadProps {
  file: Upload
  className?: string
}

export const Upload = ({ file, className }: UploadProps) => {
  return (
    <div key={file.fileId} className={cn('border p-2 flex flex-row items-center gap-2', className)}>
      {file.progress == 1 ? (
        <div className="w-6 h-6 shrink-0">
          <IconPaperclip className="w-full h-full"></IconPaperclip>
        </div>
      ) : (
        <div className="w-6 h-6 shrink-0">
          <CircularProgressbar value={file.progress * 100}></CircularProgressbar>
        </div>
      )}
      <div className="overflow-hidden">
        <div className="flex-1 overflow-hidden whitespace-nowrap text-ellipsis">
          {file.fileName}
        </div>
        <div className="flex-1 overflow-hidden whitespace-nowrap text-ellipsis">
          type = {file.fileType} size = {file.fileSize}
        </div>
      </div>
    </div>
  )
}

interface UploadListProps {
  files: Upload[]
}

export const UploadList = ({ files }: UploadListProps) => {
  if (files.length == 0) return <></>
  return (
    <div className="flex flex-row flex-wrap">
      {files.map((file) => {
        return <Upload key={file.fileId} file={file} className="w-[250px] mt-2 mx-2"></Upload>
      })}
    </div>
  )
}
