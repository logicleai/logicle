import { useTranslation } from 'next-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface ErrorProps {
  message?: string
  hidden?: boolean
}

const Error = (props: ErrorProps) => {
  const { message } = props
  const { t } = useTranslation('common')

  return (
    <Alert variant="destructive" className={props.hidden ? 'invisible' : 'visible'}>
      <AlertDescription>
        <p>{message || t('unknown-error')}</p>
      </AlertDescription>
    </Alert>
  )
}

export default Error
