import { Toaster } from 'react-hot-toast'
import '../styles/globals.css'
import ConfirmationModalContextProvider from '@/components/providers/confirmationContext'
import ClientSessionProvider from './context/client-session-provider'
import ClientI18nProvider from './context/client-i18n-provider'
import ThemeProvider from '@/components/providers/themeContext'
import { auth } from '../auth'
import { Metadata } from 'next'
import { Red_Hat_Display } from 'next/font/google'
import { Environment, EnvironmentProvider } from './context/environmentProvider'
import env from '@/lib/env'
import UserProfileProvider from '@/components/providers/userProfileContext'
import { ActiveWorkspaceProvider } from '@/components/providers/activeWorkspaceContext'

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
    ssoConfigLock: env.sso.locked,
    enableWorkspaces: env.workspaces.enable,
    enableTools: env.tools.enable,
    enableSignup: env.signup.enable,
  }
  return (
    <html lang="en" className={openSans.className}>
      <body className="overflow-hidden h-full">
        <ThemeProvider>
          <ConfirmationModalContextProvider>
            <Toaster toastOptions={{ duration: 4000 }} />
            <ClientI18nProvider>
              <EnvironmentProvider value={environment}>
                <ClientSessionProvider session={session}>
                  <UserProfileProvider>
                    <ActiveWorkspaceProvider>{children}</ActiveWorkspaceProvider>
                  </UserProfileProvider>
                </ClientSessionProvider>
              </EnvironmentProvider>
            </ClientI18nProvider>
          </ConfirmationModalContextProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
