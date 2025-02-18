import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription } from '@/components/ui/alert'

interface ErrorProps {
  children?: string
  hidden?: boolean
}

const Error = ({ children: msg, hidden }: ErrorProps) => {
  const { t } = useTranslation()

  return (
    <Alert variant="destructive" className={hidden ? 'invisible' : 'visible'}>
      <AlertDescription>
        <p>{msg || t('unknown-error')}</p>
      </AlertDescription>
    </Alert>
  )
}

export default Error
