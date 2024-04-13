import { IconPaperclip, IconPlayerStopFilled, IconSend2 } from '@tabler/icons-react'
import { ChangeEvent, KeyboardEvent, useContext, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'next-i18next'
import ChatPageContext from '@/app/chat/components/context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import 'react-circular-progressbar/dist/styles.css'
import { Attachment } from '@/types/chat'
import { Upload, UploadList } from '../../../components/app/upload'
import { post } from '@/lib/fetch'
import * as dto from '@/types/dto'
import toast from 'react-hot-toast'
import { useEnvironment } from '@/app/context/environmentProvider'

interface Props {
  onSend: (message: string, attachments: Attachment[]) => void
}

export const ChatInput = ({ onSend }: Props) => {
  const { t } = useTranslation('common')
  const {
    state: { chatStatus },
  } = useContext(ChatPageContext)

  const uploadFileRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const environment = useEnvironment()
  const [content, setContent] = useState<string>()
  const [isTyping, setIsTyping] = useState<boolean>(false)
  // using useState to keep the state of the uploads does not work, as xhr callbacks will not "pick up"
  // the state change, as they're bound to the state at xhr creation
  // Simplest solution I found is using the state just to force the refresg, and keep the upload
  // status in a useRef()

  const uploadedFiles = useRef<Upload[]>([])
  const [, setRefresh] = useState<number>(0)

  useEffect(() => {
    if (textareaRef && textareaRef.current) {
      textareaRef.current.style.height = 'inherit'
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`
    }
  }, [textareaRef, content])

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value
    setContent(value)
  }

  const handleSend = () => {
    if (chatStatus.state !== 'idle') {
      return
    }

    onSend(
      content ?? '',
      uploadedFiles.current.map((upload) => {
        return {
          id: upload.fileId!,
          mimetype: upload.fileType,
          name: upload.fileName,
          size: upload.fileSize,
        }
      })
    )
    uploadedFiles.current = []
    setContent('')

    if (window.innerWidth < 640 && textareaRef && textareaRef.current) {
      textareaRef.current.blur()
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
    if (e.key === 'Enter' && !isTyping && !isMobile() && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const handleFileUploadChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    const insertRequest: dto.InsertableFile = {
      size: file.size,
      type: file.type,
      name: file.name,
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
        fileName: file.name,
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
      console.log(`progress = ${progress}`)
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

  const anyUploadRunning = !!uploadedFiles.current.find((u) => !u.fileId)
  const msgEmpty = (content?.length ?? 0) == 0 && uploadedFiles.current.length == 0

  return (
    <div className="pt-.5 px-4">
      <div className="relative max-w-[700px] mx-auto w-full flex flex-col rounded-md border">
        <UploadList files={uploadedFiles.current}></UploadList>
        <textarea
          ref={textareaRef}
          className="m-0 w-full resize-none border-0 p-0 py-2 pr-8 pl-10 md:py-3 md:pl-10 bg-background text-body1"
          style={{
            resize: 'none',
            bottom: `${textareaRef?.current?.scrollHeight}px`,
            maxHeight: '200px',
            overflow: `auto`,
          }}
          placeholder={t('message-logicle') || ''}
          value={content}
          rows={1}
          onCompositionStart={() => setIsTyping(true)}
          onCompositionEnd={() => setIsTyping(false)}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
        />

        {chatStatus.state !== 'idle' ? (
          <Button
            className="absolute right-2 bottom-2 opacity-60"
            size="icon"
            variant="secondary"
            onClick={() => handleStopConversation()}
          >
            <IconPlayerStopFilled size={18} />
          </Button>
        ) : (
          <>
            <Button
              className="absolute right-2 bottom-2"
              size="icon"
              disabled={msgEmpty || anyUploadRunning}
              variant="primary"
              onClick={() => handleSend()}
            >
              <IconSend2 size={18} />
            </Button>
            {environment.enableTools && (
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
