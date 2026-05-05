import { Trans, useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FormField, FormItem, FormLabel } from '@/components/ui/form'
import { UseFormReturn, useWatch } from 'react-hook-form'
import { ChangeEvent, useEffect, useRef, useState } from 'react'
import { getFileAnalysis } from '@/services/files'
import * as dto from '@/types/dto'
import { Upload } from '@/components/app/upload'
import { post } from '@/lib/fetch'
import toast from 'react-hot-toast'
import { ScrollArea } from '@/components/ui/scroll-area'
import { IconGripVertical, IconMistOff, IconUpload } from '@tabler/icons-react'
import { FormFields } from './AssistantFormField'
import { useUserProfile } from '@/components/providers/userProfileContext'

interface KnowledgeTabPanelProps {
  className: string
  form: UseFormReturn<FormFields>
  visible: boolean
  modelId?: string
  assistantId?: string
  onHasWarnings?: (hasWarnings: boolean) => void
}

export const KnowledgeTabPanel = ({ form, visible, className, modelId, assistantId, onHasWarnings }: KnowledgeTabPanelProps) => {
  const uploadFileRef = useRef<HTMLInputElement>(null)
  const lastWarningStateRef = useRef<boolean | undefined>(undefined)
  const { t } = useTranslation()
  const userProfile = useUserProfile()
  const [isDragActive, setIsDragActive] = useState(false)
  const draggingUploadIdRef = useRef<string | null>(null)

  // All uploads (pre-existing at mount and newly added), tracked by XHR callbacks via ref,
  // mirrored into state for rendering. The `order` field drives display order and form rebuild order.
  const initialFiles = form.getValues('files')
  const uploadsRef = useRef<Upload[]>(
    initialFiles.map((f, i) => ({
      fileId: f.id,
      fileName: f.name,
      fileType: f.type,
      fileSize: f.size,
      progress: 1,
      done: true,
      order: i,
    }))
  )
  const nextOrder = useRef(initialFiles.length)
  const [uploadsState, setUploadsState] = useState<Upload[]>(uploadsRef.current)
  const syncState = () => setUploadsState([...uploadsRef.current])

  // Rebuilds form.files from all completed uploads sorted by local UI order.
  // Called whenever a new upload finishes or a file is deleted.
  const rebuildFormFiles = () => {
    const completed = uploadsRef.current
      .filter((u) => u.done)
      .sort((a, b) => a.order - b.order)
      .map((u) => ({
        id: u.fileId,
        name: u.fileName,
        type: u.fileType,
        size: u.fileSize,
      }))
    form.setValue('files', completed, { shouldDirty: true })
  }

  const watchedFiles = useWatch({ control: form.control, name: 'files' })

  useEffect(() => {
    const publishWarningState = (hasWarnings: boolean) => {
      if (lastWarningStateRef.current === hasWarnings) return
      lastWarningStateRef.current = hasWarnings
      onHasWarnings?.(hasWarnings)
    }

    if (!modelId || watchedFiles.length === 0) {
      publishWarningState(false)
      return
    }
    let mounted = true
    Promise.all(watchedFiles.map((f) => getFileAnalysis(f.id, modelId))).then((results) => {
      if (!mounted) return
      publishWarningState(results.some((r) => r.data?.warnings && r.data.warnings.length > 0))
    })
    return () => {
      mounted = false
    }
  }, [modelId, watchedFiles, onHasWarnings])

  const onDeleteUpload = async (upload: Upload) => {
    uploadsRef.current = uploadsRef.current.filter((u) => u.fileId !== upload.fileId)
    syncState()
    if (upload.done) {
      rebuildFormFiles()
    }
  }

  const handleUploadDragStart = (uploadId: string) => {
    draggingUploadIdRef.current = uploadId
  }

  const handleUploadDragEnd = () => {
    draggingUploadIdRef.current = null
  }

  const handleUploadDrop = (targetUploadId: string) => {
    const sourceUploadId = draggingUploadIdRef.current
    draggingUploadIdRef.current = null
    if (!sourceUploadId || sourceUploadId === targetUploadId) {
      return
    }

    const ordered = uploadsRef.current.slice().sort((a, b) => a.order - b.order)
    const sourceIndex = ordered.findIndex((upload) => upload.fileId === sourceUploadId)
    const targetIndex = ordered.findIndex((upload) => upload.fileId === targetUploadId)
    if (sourceIndex < 0 || targetIndex < 0) {
      return
    }

    const [moved] = ordered.splice(sourceIndex, 1)
    ordered.splice(targetIndex, 0, moved)
    uploadsRef.current = ordered.map((upload, index) => ({ ...upload, order: index }))
    syncState()
    rebuildFormFiles()
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
    if (droppedFiles.length > 0) {
      for (const file of droppedFiles) {
        await processAndUploadFile(file, file.name)
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
      owner: assistantId
        ? { ownerType: 'ASSISTANT', ownerId: assistantId }
        : { ownerType: 'USER', ownerId: userProfile!.id },
    }
    const response = await post<dto.File>(`/api/files`, insertRequest)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    const uploadEntry = response.data
    const id = uploadEntry.id
    const order = nextOrder.current++
    uploadsRef.current = [
      ...uploadsRef.current,
      {
        fileId: id,
        fileName: fileName,
        fileType: file.type,
        fileSize: file.size,
        progress: 0,
        done: false,
        order,
      },
    ]
    syncState()
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', `/api/files/${id}/content`, true)
    const handleFailure = () => {
      if (uploadsRef.current.find((u) => u.fileId === id)) {
        toast.error(`Failed uploading ${fileName}`)
        uploadsRef.current = uploadsRef.current.filter((u) => u.fileId !== id)
        syncState()
      }
    }
    xhr.upload.addEventListener('progress', (evt) => {
      const progress = 0.9 * (evt.loaded / file.size)
      uploadsRef.current = uploadsRef.current.map((u) => (u.fileId === id ? { ...u, progress } : u))
      syncState()
    })
    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.DONE) {
        return
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        const canonicalId: string = xhr.response?.id ?? id
        uploadsRef.current = uploadsRef.current.map((u) =>
          u.fileId === id ? { ...u, fileId: canonicalId, progress: 1, done: true } : u
        )
        syncState()
        rebuildFormFiles()
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

  const allUploads = uploadsState.slice().sort((a, b) => a.order - b.order)

  return (
    <FormField
      control={form.control}
      name="files"
      render={({ field }) => (
        <div
          className={`flex flex-col overflow-hidden ${className}`}
          style={{ display: visible ? undefined : 'none' }}
        >
          <ScrollArea className="flex-1 min-w-0 min-h-0">
            <div className="flex flex-col gap-3 mr-4">
              <FormItem>
                <div>
                  <FormLabel className="flex items-center gap-3 p-1"></FormLabel>
                  {allUploads.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                      <IconMistOff size={48} className="mb-2" />
                      <span className="text-sm">{t('no-files-uploaded')}</span>
                    </div>
                  ) : (
                    <div className="flex flex-row flex-wrap">
                      {allUploads.map((upload) => (
                        <div
                          key={upload.fileId}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) => {
                            event.preventDefault()
                            handleUploadDrop(upload.fileId)
                          }}
                          className="relative"
                        >
                          {!field.disabled && (
                            <div
                              draggable
                              onDragStart={() => handleUploadDragStart(upload.fileId)}
                              onDragEnd={handleUploadDragEnd}
                              className="absolute left-3 top-3 z-10 rounded border bg-background p-1 cursor-grab active:cursor-grabbing"
                              title="Drag to reorder"
                            >
                              <IconGripVertical size={14} />
                            </div>
                          )}
                          <Upload
                            disabled={field.disabled}
                            onDelete={() => onDeleteUpload(upload)}
                            file={upload}
                            className="w-[250px] mt-2 mx-2 pl-8"
                            onDownload={() => downloadFile(upload)}
                            modelId={modelId}
                          />
                        </div>
                      ))}
                    </div>
                  )}
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
            </div>
          </ScrollArea>{' '}
          {!field.disabled && (
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
          )}
        </div>
      )}
    ></FormField>
  )
}
