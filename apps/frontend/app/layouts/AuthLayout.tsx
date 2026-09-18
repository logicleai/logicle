'use client'

import { useTranslation } from 'react-i18next'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import Logo from '../../public/logo.png'
import { useEnvironment } from '../context/environmentProvider'

interface AuthLayoutProps {
  children: React.ReactNode
  heading?: string
  description?: string
}

export default function AuthLayout({ children, heading, description }: AuthLayoutProps) {
  const { t } = useTranslation()
  const environment = useEnvironment()
  const pathname = usePathname()
  const isSignup = pathname === '/auth/join'
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <aside className="hidden w-[42%] flex-col justify-between bg-[hsl(var(--sidebar))] p-12 lg:flex xl:p-16">
        <div className="flex items-center gap-3">
          <Image
            src={environment.logoPath ?? Logo}
            className="h-10 w-auto"
            alt={environment.appDisplayName}
            width={80}
            height={80}
            unoptimized
          />
          <span className="text-lg font-bold">{environment.appDisplayName}</span>
        </div>
        <div className="max-w-md">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.12em] text-primary">
            {environment.appDisplayName}
          </p>
          <h1 className="text-4xl font-bold leading-tight xl:text-5xl">
            {t(isSignup ? 'create-a-new-account' : 'sign-in-with-email')}
          </h1>
          <p className="mt-5 max-w-sm text-base leading-7 text-muted-foreground">
            {description
              ? t(description)
              : t(isSignup ? 'sign-up-message' : 'sign-in-with-password')}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">v{environment.appVersion}</p>
      </aside>
      <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[420px]">
          <div className="mb-8 lg:hidden">
            <Image
              src={environment.logoPath ?? Logo}
              className="mx-auto h-12 w-auto"
              alt={environment.appDisplayName}
              width={80}
              height={80}
              unoptimized
            />
          </div>
          {heading && <h2 className="mb-2 text-center text-2xl font-bold">{t(heading)}</h2>}
          {children}
        </div>
      </main>
    </div>
  )
}
