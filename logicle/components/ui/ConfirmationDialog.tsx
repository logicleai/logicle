import { useTranslation } from 'next-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { IconTrash } from '@tabler/icons-react'

interface ConfirmationDialogProps {
  title: string
  visible: boolean
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  confirmText?: string
  cancelText?: string
  destructive?: boolean
  children: React.ReactNode
}

const ConfirmationDialog = ({
  title,
  children,
  onConfirm,
  onCancel,
  confirmText,
  cancelText,
  destructive,
}: ConfirmationDialogProps) => {
  const { t } = useTranslation('common')

  const handleConfirm = async () => {
    await onConfirm()
    onCancel()
  }

  return (
    <AlertDialog open={true}>
      <AlertDialogContent>
        <IconTrash stroke="1" className="text-destructive mx-auto"></IconTrash>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
        </AlertDialogHeader>
        <p className="text-center text-secondary_text_color">{children}</p>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{cancelText || t('cancel')}</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            variant={destructive ? 'destructive' : undefined}
          >
            {confirmText || t('delete')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export default ConfirmationDialog
