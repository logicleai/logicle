import { useTranslation } from 'react-i18next'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface ConfirmationDialogProps {
  title: string
  description?: string
  onConfirm: () => void | Promise<void>
  onCancel: () => void
  confirmText?: string
  cancelText?: string
  destructive?: boolean
  children: React.ReactNode
  icon?: JSX.Element
}

const ConfirmationDialog = ({
  title,
  description,
  children,
  onConfirm,
  onCancel,
  confirmText,
  cancelText,
  destructive,
  icon,
}: ConfirmationDialogProps) => {
  const { t } = useTranslation()

  const handleConfirm = async () => {
    await onConfirm()
    onCancel()
  }

  return (
    <AlertDialog open={true}>
      <AlertDialogContent>
        <div className="mx-auto">{icon ? icon : <></>}</div>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
        </AlertDialogHeader>
        {children}
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
      <AlertDialogDescription>{description ?? title}</AlertDialogDescription>
    </AlertDialog>
  )
}

export default ConfirmationDialog
