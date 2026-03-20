'use client'

import { Trans } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { UseFormReturn } from 'react-hook-form'
import { ChangeEvent, useRef, useState } from 'react'
import * as dto from '@/types/dto'
import { Upload } from '@/components/app/upload'
import { post } from '@/lib/fetch'
import toast from 'react-hot-toast'
import { IconUpload } from '@tabler/icons-react'
import { ToolFormFields } from './toolFormTypes'

interface ToolKnowledgeSectionProps {
  form: UseFormReturn<ToolFormFields>
}

export const ToolKnowledgeSection = ({ form }: ToolKnowledgeSectionProps) => {
  const uploadFileRef = useRef<HTMLInputElement>(null)

  const [isDragActive, setIsDragActive] = useState(false)

  const uploadStatus = useRef<Upload[]>([])
  const [uploadStatusState, setUploadStatusState] = useState<Upload[]>([])

  const syncUploadStatusState = () => {
    setUploadStatusState([...uploadStatus.current])
  }

  const onDeleteUpload = (upload: Upload) => {
    uploadStatus.current = uploadStatus.current.filter((u) => u.fileId !== upload.fileId)
    syncUploadStatusState()
    form.setValue('files', form.getValues('files').filter((f) => f.id !== upload.fileId))
  }

  const handleDragOver = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragActive(true)
  }

  const handleDragEnter = (event: React.DragEvent) => {
    event.preventDefault()
    setIsDragActive(true)
  }

  const handleDragLeave = () => {
    setIsDragActive(false)
  }

  const handleDrop = async (evt: React.DragEvent) => {
    setIsDragActive(false)
    evt.preventDefault()
    const droppedFiles = evt.dataTransfer.files
    for (const file of droppedFiles) {
      void processAndUploadFile(file, file.name)
    }
  }

  const handleFileUploadChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) return
    for (const file of Array.from(files)) {
      await processAndUploadFile(file, file.name)
    }
  }

  const downloadFile = (upload: Upload) => {
    const link = document.createElement('a')
    link.download = upload.fileName
    link.href = `/api/files/${upload.fileId}/content`
    link.style.display = 'none'
    link.click()
  }

  const processAndUploadFile = async (file: Blob, fileName: string) => {
    const insertRequest: dto.InsertableFile = {
      size: file.size,
      type: file.type,
      name: fileName,
    }
    const response = await post<dto.File>(`/api/files`, insertRequest)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    const uploadEntry = response.data
    const id = uploadEntry.id
    uploadStatus.current = [
      {
        fileId: id,
        fileName: fileName,
        fileType: file.type,
        fileSize: file.size,
        progress: 0,
        done: false,
      },
      ...uploadStatus.current,
    ]
    syncUploadStatusState()

    const xhr = new XMLHttpRequest()
    xhr.open('PUT', `/api/files/${id}/content`, true)

    const handleFailure = () => {
      if (uploadStatus.current.find((u) => u.fileId === id)) {
        toast.error(`Failed uploading ${fileName}`)
        uploadStatus.current = uploadStatus.current.filter((u) => u.fileId !== id)
        syncUploadStatusState()
      }
    }

    xhr.upload.addEventListener('progress', (evt) => {
      const progress = 0.9 * (evt.loaded / file.size)
      uploadStatus.current = uploadStatus.current.map((u) =>
        u.fileId === id ? { ...u, progress } : u
      )
      syncUploadStatusState()
    })

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.DONE) return
      if (xhr.status >= 200 && xhr.status < 300) {
        const found = uploadStatus.current.find((u) => u.fileId === id)
        uploadStatus.current = uploadStatus.current.filter((u) => u.fileId !== id)
        syncUploadStatusState()
        if (found) {
          form.setValue('files', [
            ...form.getValues('files'),
            { id: found.fileId, name: found.fileName, type: found.fileType, size: found.fileSize },
          ])
        }
      } else {
        handleFailure()
      }
    }
    xhr.responseType = 'json'
    xhr.onerror = handleFailure
    xhr.onabort = handleFailure
    xhr.ontimeout = handleFailure
    xhr.send(file)
  }

  const existingFiles: Upload[] = form.getValues('files').map((f) => ({
    fileId: f.id,
    fileName: f.name,
    fileType: f.type,
    fileSize: f.size,
    progress: 1,
    done: true,
  }))

  const allUploads: Upload[] = [...existingFiles, ...uploadStatusState]

  const openFilePicker = (evt: React.MouseEvent) => {
    evt.preventDefault()
    if (uploadFileRef.current) {
      uploadFileRef.current.value = ''
      uploadFileRef.current.click()
    }
  }

  return (
    <div
      className={`flex flex-col gap-2 p-4 rounded-md border transition-colors ${isDragActive ? 'bg-blue-50 border-blue-400' : 'border-input'}`}
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
    >
      <Input
        type="file"
        className="sr-only"
        multiple
        ref={uploadFileRef}
        onClick={(e) => {
          e.currentTarget.value = ''
        }}
        onChange={handleFileUploadChange}
      />
      {allUploads.length > 0 && (
        <div className="flex flex-row flex-wrap">
          {allUploads.map((upload) => (
            <Upload
              key={upload.fileId}
              onDelete={() => onDeleteUpload(upload)}
              file={upload}
              className="w-[250px] mt-2 mx-2"
              onDownload={() => downloadFile(upload)}
            />
          ))}
        </div>
      )}
      <div className={`flex items-center justify-center gap-2 py-4 text-sm text-gray-400 ${allUploads.length === 0 ? 'py-8' : 'py-2'}`}>
        <IconUpload size={16} />
        <span>
          <Trans
            i18nKey="drop_files_here_or_browse_for_file_upload"
            components={[
              <Button variant="link" size="link" key="browse" onClick={openFilePicker}>
                {' '}
              </Button>,
            ]}
          />
        </span>
      </div>
    </div>
  )
}
