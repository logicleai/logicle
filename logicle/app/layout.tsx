import { Toaster } from 'react-hot-toast'
import '../styles/globals.css'
import ConfirmationModalContextProvider from '@/components/providers/confirmationContext'
import ClientSessionProvider from './context/client-session-provider'
import ClientI18nProvider from './context/client-i18n-provider'
import ThemeProvider from '@/components/providers/themeContext'
import { auth } from '../auth'
import { Metadata } from 'next'
import { Red_Hat_Display } from 'next/font/google'
import { Environment, EnvironmentContext, EnvironmentProvider } from './context/environmentProvider'
import env from '@/lib/env'

const openSans = Red_Hat_Display({
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    template: '%s • Logicle',
    default: 'Logicle',
  },
}

export default async function RootLayout({
  // Layouts must accept a children prop.
  // This will be populated with nested layouts or pages
  children,
}: {
  children: React.ReactNode
}) {
  //initi18n()
  const session = await auth()
  const environment: Environment = {
    ssoConfigLock: env.ssoConfigLock,
  }
  return (
    <html lang="en" className={openSans.className}>
      <body className="overflow-hidden">
        <ThemeProvider>
          <ConfirmationModalContextProvider>
            <Toaster toastOptions={{ duration: 4000 }} />
            <ClientI18nProvider>
              <EnvironmentProvider value={environment}>
                <ClientSessionProvider session={session}>{children}</ClientSessionProvider>
              </EnvironmentProvider>
            </ClientI18nProvider>
          </ConfirmationModalContextProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
