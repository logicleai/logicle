import { Error, Loading } from '@/components/ui'
import { FC } from 'react'

interface WithLoadingAndErrorProps {
  isLoading: boolean
  error?: { message: string }
  children: React.ReactNode
}

const WithLoadingAndError: FC<WithLoadingAndErrorProps> = (props: WithLoadingAndErrorProps) => {
  const { isLoading, error, children } = props

  if (isLoading) {
    return <Loading />
  }

  if (error) {
    return <Error>{error.message}</Error>
  }

  return <>{children}</>
}

export default WithLoadingAndError
