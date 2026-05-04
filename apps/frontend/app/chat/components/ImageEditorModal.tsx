'use client'
import { FC, useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { editImage } from '@/services/imageEdit'
import type * as dto from '@/types/dto'
import { IconEraser, IconPencil } from '@tabler/icons-react'

interface Props {
  fileId: string
  fileType: string
  conversationId?: string
  onClose: () => void
  onSuccess: (attachment: dto.Attachment) => void
}

type DrawMode = 'brush' | 'eraser'

const BRUSH_RADIUS = 20
const BRUSH_COLOR_DISPLAY = 'rgba(255, 60, 60, 0.5)' // semi-transparent red overlay

export const ImageEditorModal: FC<Props> = ({
  fileId,
  fileType,
  conversationId,
  onClose,
  onSuccess,
}) => {
  const { t } = useTranslation()
  const [prompt, setPrompt] = useState('')
  const [isEditing, setIsEditing] = useState(false)
  const [resultAttachment, setResultAttachment] = useState<dto.Attachment | null>(null)
  const [hasMask, setHasMask] = useState(false)
  const [drawMode, setDrawMode] = useState<DrawMode>('brush')

  const displayCanvasRef = useRef<HTMLCanvasElement>(null)
  const maskCanvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const isDrawingRef = useRef(false)

  const imageUrl = `/api/files/${fileId}/content`

  // Load image and size canvases
  useEffect(() => {
    const img = new Image()
    img.crossOrigin = 'use-credentials'
    img.onload = () => {
      imgRef.current = img
      const display = displayCanvasRef.current
      const mask = maskCanvasRef.current
      if (!display || !mask) return

      display.width = img.naturalWidth
      display.height = img.naturalHeight
      mask.width = img.naturalWidth
      mask.height = img.naturalHeight

      const dCtx = display.getContext('2d')!
      dCtx.drawImage(img, 0, 0)

      // Mask canvas: black = preserve, white = edit
      const mCtx = mask.getContext('2d')!
      mCtx.fillStyle = 'black'
      mCtx.fillRect(0, 0, mask.width, mask.height)
    }
    img.src = imageUrl
  }, [imageUrl])

  const getCanvasPos = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = displayCanvasRef.current!
    const rect = canvas.getBoundingClientRect()
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  const paint = useCallback(
    (x: number, y: number) => {
      const display = displayCanvasRef.current
      const mask = maskCanvasRef.current
      if (!display || !mask || !imgRef.current) return

      const dCtx = display.getContext('2d')!
      const mCtx = mask.getContext('2d')!

      if (drawMode === 'brush') {
        // Display: red overlay circle
        dCtx.save()
        dCtx.globalCompositeOperation = 'source-over'
        dCtx.beginPath()
        dCtx.arc(x, y, BRUSH_RADIUS, 0, Math.PI * 2)
        dCtx.fillStyle = BRUSH_COLOR_DISPLAY
        dCtx.fill()
        dCtx.restore()

        // Mask: white circle (editable area)
        mCtx.save()
        mCtx.globalCompositeOperation = 'source-over'
        mCtx.beginPath()
        mCtx.arc(x, y, BRUSH_RADIUS, 0, Math.PI * 2)
        mCtx.fillStyle = 'white'
        mCtx.fill()
        mCtx.restore()

        setHasMask(true)
      } else {
        // Eraser: redraw original image slice on display canvas
        dCtx.save()
        dCtx.globalCompositeOperation = 'source-over'
        dCtx.beginPath()
        dCtx.arc(x, y, BRUSH_RADIUS, 0, Math.PI * 2)
        dCtx.clip()
        dCtx.drawImage(imgRef.current, 0, 0)
        dCtx.restore()

        // Mask: black circle (preserve area)
        mCtx.save()
        mCtx.globalCompositeOperation = 'source-over'
        mCtx.beginPath()
        mCtx.arc(x, y, BRUSH_RADIUS, 0, Math.PI * 2)
        mCtx.fillStyle = 'black'
        mCtx.fill()
        mCtx.restore()
      }
    },
    [drawMode]
  )

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDrawingRef.current = true
    const pos = getCanvasPos(e)
    paint(pos.x, pos.y)
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawingRef.current) return
    const pos = getCanvasPos(e)
    paint(pos.x, pos.y)
  }

  const handleMouseUp = () => {
    isDrawingRef.current = false
  }

  const clearMask = () => {
    const display = displayCanvasRef.current
    const mask = maskCanvasRef.current
    if (!display || !mask || !imgRef.current) return

    const dCtx = display.getContext('2d')!
    dCtx.drawImage(imgRef.current, 0, 0)

    const mCtx = mask.getContext('2d')!
    mCtx.fillStyle = 'black'
    mCtx.fillRect(0, 0, mask.width, mask.height)

    setHasMask(false)
  }

  const exportMaskBlob = (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const mask = maskCanvasRef.current
      if (!mask) return resolve(null)
      mask.toBlob((blob) => resolve(blob), 'image/png')
    })
  }

  const handleSubmit = async () => {
    if (!prompt.trim()) return
    setIsEditing(true)
    try {
      const maskBlob = hasMask ? await exportMaskBlob() : null
      const result = await editImage({
        fileId,
        prompt,
        conversationId,
        mask: maskBlob,
      })
      const attachment: dto.Attachment = {
        id: result.id,
        mimetype: result.mimetype,
        name: result.name,
        size: result.size,
      }
      setResultAttachment(attachment)
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('something-went-wrong')
      // show inline error instead of toast so modal stays open
      setEditError(message)
    } finally {
      setIsEditing(false)
    }
  }

  const [editError, setEditError] = useState<string | null>(null)

  const handleUseInChat = () => {
    if (resultAttachment) {
      onSuccess(resultAttachment)
    }
  }

  const handleEditAgain = () => {
    setResultAttachment(null)
    setEditError(null)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-full">
        <DialogHeader>
          <DialogTitle>{t('edit_image')}</DialogTitle>
        </DialogHeader>

        {!resultAttachment ? (
          <div className="flex flex-col gap-4">
            {/* Canvas area */}
            <div className="relative flex justify-center overflow-auto max-h-[50vh] bg-checkerboard rounded">
              <canvas
                ref={displayCanvasRef}
                className="max-w-full cursor-crosshair"
                style={{ maxHeight: '45vh', objectFit: 'contain' }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
              />
              {/* Hidden mask canvas */}
              <canvas ref={maskCanvasRef} className="hidden" />
            </div>

            {/* Mask controls */}
            <div className="flex items-center gap-2 text-sm">
              <button
                type="button"
                title={t('brush')}
                className={`p-1.5 rounded border ${drawMode === 'brush' ? 'bg-primary text-primary-foreground' : ''}`}
                onClick={() => setDrawMode('brush')}
              >
                <IconPencil size={16} />
              </button>
              <button
                type="button"
                title={t('eraser')}
                className={`p-1.5 rounded border ${drawMode === 'eraser' ? 'bg-primary text-primary-foreground' : ''}`}
                onClick={() => setDrawMode('eraser')}
              >
                <IconEraser size={16} />
              </button>
              {hasMask && (
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground underline"
                  onClick={clearMask}
                >
                  {t('clear_mask')}
                </button>
              )}
              {!hasMask && (
                <span className="text-muted-foreground italic">
                  {t('no_mask_whole_image_edit')}
                </span>
              )}
            </div>

            {/* Prompt */}
            <Textarea
              placeholder={t('edit_image_prompt_placeholder')}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={2}
              disabled={isEditing}
            />

            {editError && <p className="text-destructive text-sm">{editError}</p>}

            <DialogFooter>
              <Button variant="secondary" onClick={onClose} disabled={isEditing}>
                {t('cancel')}
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                disabled={isEditing || !prompt.trim()}
              >
                {isEditing ? t('editing') + '…' : t('edit_image_submit')}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div className="flex justify-center overflow-auto max-h-[50vh]">
              <img
                alt={t('edit_result')}
                src={`/api/files/${resultAttachment.id}/content`}
                className="max-w-full rounded"
                style={{ maxHeight: '45vh', objectFit: 'contain' }}
              />
            </div>
            <DialogFooter className="gap-2">
              <Button variant="secondary" onClick={handleEditAgain}>
                {t('edit_again')}
              </Button>
              <Button variant="primary" onClick={handleUseInChat}>
                {t('use_in_chat')}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
