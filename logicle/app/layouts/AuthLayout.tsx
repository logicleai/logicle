import app from '@/lib/app'
import { useTranslation } from 'next-i18next'
import Image from 'next/image'
import Logo from '../../public/logo.png'

interface AuthLayoutProps {
  children: React.ReactNode
  heading?: string
  description?: string
}

export default function AuthLayout({ children, heading, description }: AuthLayoutProps) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-full items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div>
          <Image src={Logo} className="mx-auto h-16 w-auto" alt={app.name} width={80} height={80} />
          {heading && (
            <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">{t(heading)}</h2>
          )}
          {description && <p className="mt-2 text-center text-gray-600">{t(description)}</p>}
        </div>
        {children}
      </div>
    </div>
  )
}
