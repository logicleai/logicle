import { IconPaperclip, IconPlayerStopFilled, IconSend2 } from '@tabler/icons-react'
import {
  ChangeEvent,
  DragEvent,
  KeyboardEvent,
  MutableRefObject,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import { useTranslation } from 'next-i18next'
import ChatPageContext from '@/app/chat/components/context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import 'react-circular-progressbar/dist/styles.css'
import { Upload, UploadList } from '../../../components/app/upload'
import { post } from '@/lib/fetch'
import * as dto from '@/types/dto'
import toast from 'react-hot-toast'
import { useEnvironment } from '@/app/context/environmentProvider'
import { limitImageSize } from '@/lib/resizeImage'

interface Props {
  onSend: (params: { content: string; attachments: dto.Attachment[] }) => void
  disabled?: boolean
  disabledMsg?: string
  textAreaRef?: MutableRefObject<HTMLTextAreaElement | null>
}

export const ChatInput = ({ onSend, disabled, disabledMsg, textAreaRef }: Props) => {
  const { t } = useTranslation('common')
  const {
    setChatInput,
    state: { chatStatus, chatInput },
  } = useContext(ChatPageContext)

  const uploadFileRef = useRef<HTMLInputElement>(null)
  const textareaRefInt = useRef<HTMLTextAreaElement>(null)
  if (textAreaRef) {
    textAreaRef.current = textareaRefInt.current
  }
  const environment = useEnvironment()
  const [isTyping, setIsTyping] = useState<boolean>(false)
  // using useState to keep the state of the uploads does not work, as xhr callbacks will not "pick up"
  // the state change, as they're bound to the state at xhr creation
  // Simplest solution I found is using the state just to force the refresg, and keep the upload
  // status in a useRef()

  const uploadedFiles = useRef<Upload[]>([])
  const [, setRefresh] = useState<number>(0)
  const anyUploadRunning = !!uploadedFiles.current.find((u) => u.progress != 1)
  const msgEmpty = (chatInput.trim().length ?? 0) == 0 && uploadedFiles.current.length == 0

  useEffect(() => {
    textareaRefInt.current?.focus()
  }, [])

  useEffect(() => {
    if (textareaRefInt && textareaRefInt.current) {
      textareaRefInt.current.style.height = 'inherit'
      textareaRefInt.current.style.height = `${textareaRefInt.current.scrollHeight}px`
    }
  }, [textareaRefInt, chatInput])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value)
  }

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const clipboardData = e.clipboardData
    const items = clipboardData.items

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const blob = items[i].getAsFile()
        if (blob) {
          await processAndUploadFile(blob, 'pasted')
        }
      }
    }
  }

  const handleSend = () => {
    if (chatStatus.state !== 'idle' || anyUploadRunning) {
      return
    }

    onSend({
      content: chatInput,
      attachments: uploadedFiles.current.map((upload) => {
        return {
          id: upload.fileId!,
          mimetype: upload.fileType,
          name: upload.fileName,
          size: upload.fileSize,
        }
      }),
    })
    uploadedFiles.current = []
    setChatInput('')

    if (window.innerWidth < 640 && textareaRefInt && textareaRefInt.current) {
      textareaRefInt.current.blur()
    }
  }

  const handleStopConversation = () => {
    if (chatStatus.state == 'receiving') {
      chatStatus.abortController.abort()
    }
  }

  const isMobile = () => {
    const userAgent = typeof window.navigator === 'undefined' ? '' : navigator.userAgent
    const mobileRegex =
      /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|mobile|CriOS/i
    return mobileRegex.test(userAgent)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !isTyping && !isMobile() && !e.shiftKey && !msgEmpty) {
      e.preventDefault()
      handleSend()
    }
  }

  const processAndUploadFile = async (file: Blob, fileName: string) => {
    if (!environment.chatAttachmentsAllowedFormats.includes(file.type)) {
      toast(`Can't upload file '${fileName}'. Unsupported file format ${file.type}`)
      return
    }
    if (file.type.startsWith('image/')) {
      file = await limitImageSize(file, 2048, 2048)
    }
    await uploadFile(file, fileName)
  }

  const uploadFile = async (file: Blob, fileName: string) => {
    const insertRequest: dto.InsertableFile = {
      size: file.size,
      type: file.type,
      name: fileName,
    }
    const response = await post<dto.File>('/api/files', insertRequest)
    if (response.error) {
      toast.error(response.error.message)
      return
    }
    const uploadEntry = response.data
    const id = uploadEntry.id
    uploadedFiles.current = [
      {
        fileId: id,
        fileName: fileName,
        fileType: file.type,
        fileSize: file.size,
        progress: 0,
      },
      ...uploadedFiles.current,
    ]
    setRefresh(Math.random())
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', `/api/files/${id}/content`, true)
    xhr.upload.addEventListener('progress', (evt) => {
      const progress = evt.loaded / file.size
      uploadedFiles.current = uploadedFiles.current.map((u) => {
        return u.fileId == id ? { ...u, progress } : u
      })
      setRefresh(Math.random())
    })
    xhr.onreadystatechange = function () {
      // TODO: handle errors!
      if (xhr.readyState == XMLHttpRequest.DONE) {
        setRefresh(Math.random())
      }
    }
    xhr.responseType = 'json'
    xhr.send(file)
  }

  const handleFileUploadChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    await processAndUploadFile(file, file.name)
  }

  if (disabled) {
    return (
      <div className="pt-.5 px-4 text-body1">
        <div className="relative max-w-[700px] mx-auto w-full flex flex-col rounded-md text-center">
          {disabledMsg ?? ' '}
        </div>
        <div className="pt-2 pb-3 text-center text-[12px] opacity-50 md:px-4 md:pt-3 md:pb-6">
          {t('legal-disclaimer')}
        </div>
      </div>
    )
  }
  const handleDrop = async (evt: DragEvent) => {
    evt.preventDefault()
    const droppedFiles = evt.dataTransfer.files
    if (droppedFiles.length > 0) {
      for (const file of droppedFiles) {
        void processAndUploadFile(file, file.name)
      }
    }
  }
  const handleDelete = async (fileId: string) => {
    uploadedFiles.current = uploadedFiles.current.filter((u) => u.fileId != fileId)
    setRefresh(Math.random())
  }
  return (
    <div onDrop={handleDrop} onDragOver={(event) => event.preventDefault()} className="pt-.5 px-4">
      <div className="relative max-w-[700px] mx-auto w-full flex flex-col rounded-md border">
        <UploadList files={uploadedFiles.current} onDelete={handleDelete}></UploadList>
        <textarea
          disabled={disabled}
          ref={textareaRefInt}
          className="m-0 w-full resize-none border-0 p-0 py-2 pr-8 pl-10 md:py-3 md:pl-10 bg-background text-body1 focus:ring-0 focus:ring-offset-0"
          style={{
            resize: 'none',
            bottom: `${textareaRefInt?.current?.scrollHeight}px`,
            maxHeight: '200px',
            overflow: `auto`,
          }}
          placeholder={t('message-logicle') || ''}
          value={chatInput}
          rows={1}
          onCompositionStart={() => setIsTyping(true)}
          onCompositionEnd={() => setIsTyping(false)}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
        />

        {chatStatus.state !== 'idle' ? (
          <Button
            className="absolute right-2 bottom-2 opacity-60"
            size="icon"
            variant="secondary"
            disabled={disabled}
            onClick={() => handleStopConversation()}
          >
            <IconPlayerStopFilled size={18} />
          </Button>
        ) : (
          <>
            <Button
              className="absolute right-2 bottom-2"
              size="icon"
              disabled={disabled || msgEmpty || anyUploadRunning}
              variant="primary"
              onClick={() => handleSend()}
            >
              <IconSend2 size={18} />
            </Button>
            {environment.enableChatAttachments && (
              <>
                <label className="absolute left-2 bottom-2 p-1 cursor-pointer" htmlFor="attach_doc">
                  <IconPaperclip size={18} />
                </label>
                <Input
                  type="file"
                  id="attach_doc"
                  className="sr-only"
                  ref={uploadFileRef}
                  onChange={handleFileUploadChange}
                />
              </>
            )}
          </>
        )}
      </div>
      <div className="pt-2 pb-3 text-center text-[12px] opacity-50 md:px-4 md:pt-3 md:pb-6">
        {t('legal-disclaimer')}
      </div>
    </div>
  )
}
