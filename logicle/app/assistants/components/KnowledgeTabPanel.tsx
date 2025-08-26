import { Trans } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField, FormItem, FormLabel } from '@/components/ui/form'
import { UseFormReturn } from 'react-hook-form'
import { ChangeEvent, useRef, useState } from 'react'
import * as dto from '@/types/dto'
import { Upload } from '@/components/app/upload'
import { post } from '@/lib/fetch'
import toast from 'react-hot-toast'
import { ScrollArea } from '@/components/ui/scroll-area'
import { IconUpload } from '@tabler/icons-react'
import { FormFields } from './AssistantFormField'

interface KnowledgeTabPanelProps {
  assistant: dto.AssistantDraft
  className: string
  form: UseFormReturn<FormFields>
  visible: boolean
}

export const KnowledgeTabPanel = ({
  form,
  assistant,
  visible,
  className,
}: KnowledgeTabPanelProps) => {
  const uploadFileRef = useRef<HTMLInputElement>(null)
  const [isDragActive, setIsDragActive] = useState(false)

  // Here we store the status of the uploads, which is... form status + progress
  // Form status (files field) is derived from this on change
  const uploadStatus = useRef<Upload[]>(
    assistant.files.map((f) => {
      return {
        fileId: f.id, // backend generated id
        fileName: f.name,
        fileSize: f.size,
        fileType: f.type,
        progress: 1,
        done: true,
      }
    })
  )

  const onDeleteUpload = async (upload: Upload) => {
    uploadStatus.current = uploadStatus.current.filter((u) => u.fileId !== upload.fileId)
    updateFormFiles()
  }

  const updateFormFiles = () => {
    form.setValue(
      'files',
      uploadStatus.current.map((u) => {
        return {
          id: u.fileId,
          name: u.fileName,
          type: u.fileType,
          size: u.fileSize,
        }
      })
    )
  }

  const handleDragOver = (event) => {
    event.preventDefault()
    setIsDragActive(true)
  }

  const handleDragEnter = (event) => {
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
    if (droppedFiles.length > 0) {
      for (const file of droppedFiles) {
        void processAndUploadFile(file, file.name)
      }
    }
  }

  const handleFileUploadChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files
    if (!files) {
      return
    }
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
    const response = await post<dto.File>(`/api/files?assistantId=${assistant.id}`, insertRequest)
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
    updateFormFiles()
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', `/api/files/${id}/content`, true)
    xhr.upload.addEventListener('progress', (evt) => {
      const progress = 0.9 * (evt.loaded / file.size)
      uploadStatus.current = uploadStatus.current.map((u) => {
        return u.fileId === id ? { ...u, progress } : u
      })
      updateFormFiles()
    })
    xhr.onreadystatechange = () => {
      // TODO: handle errors!
      if (xhr.readyState === XMLHttpRequest.DONE) {
        uploadStatus.current = uploadStatus.current.map((u) => {
          return u.fileId === id ? { ...u, progress: 1, done: true } : u
        })
        updateFormFiles()
      }
    }
    xhr.responseType = 'json'
    xhr.send(file)
  }

  return (
    <div
      className={`flex flex-col overflow-hidden ${className}`}
      style={{ display: visible ? undefined : 'none' }}
    >
      <ScrollArea className="flex-1 min-w-0 min-h-0">
        <div className="flex flex-col gap-3 mr-4">
          <FormField
            control={form.control}
            name="files"
            render={() => (
              <FormItem>
                <div>
                  <FormLabel className="flex items-center gap-3 p-1"></FormLabel>
                  <div className="flex flex-row flex-wrap">
                    {uploadStatus.current.map((upload) => {
                      return (
                        <Upload
                          key={upload.fileId}
                          onDelete={() => onDeleteUpload(upload)}
                          file={upload}
                          className="w-[250px] mt-2 mx-2"
                          onDownload={() => downloadFile(upload)}
                        ></Upload>
                      )
                    })}
                  </div>
                  <Input
                    type="file"
                    className="sr-only"
                    multiple
                    ref={uploadFileRef}
                    onClick={(e) => {
                      e.currentTarget.value = '' // selecting the same file still triggers onChange
                    }}
                    onChange={handleFileUploadChange}
                  />
                </div>
              </FormItem>
            )}
          />
        </div>
      </ScrollArea>
      <div
        onDrop={handleDrop}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        className={`flex flex-col p-12 items-center gap-4 border-dashed border-4 ${
          isDragActive ? 'bg-blue-100' : 'bg-white'
        }`}
      >
        <IconUpload size={32} />
        <span>
          <Trans
            i18nKey="drop_files_here_or_browse_for_file_upload"
            components={[
              <Button
                variant="link"
                size="link"
                key="key"
                onClick={(evt) => {
                  if (uploadFileRef.current != null) {
                    uploadFileRef.current.click()
                    uploadFileRef.current.value = '' // reset the value to allow the user upload the very same file
                  }
                  evt.preventDefault()
                }}
              >
                {' '}
              </Button>,
            ]}
          />
        </span>
      </div>
    </div>
  )
}
