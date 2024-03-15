import { Toaster } from 'react-hot-toast'
import '../styles/globals.css'
import ConfirmationModalContextProvider from '@/components/providers/confirmationContext'
import ClientSessionProvider from './context/client-session-provider'
import ClientI18nProvider from './context/client-i18n-provider'
import ThemeProvider from '@/components/providers/themeprovider'
import { auth } from '../auth'
import { Red_Hat_Display } from 'next/font/google'

const openSans = Red_Hat_Display({
  subsets: ['latin'],
  display: 'swap',
})

export default async function RootLayout({
  // Layouts must accept a children prop.
  // This will be populated with nested layouts or pages
  children,
}: {
  children: React.ReactNode
}) {
  //initi18n()
  const session = await auth()
  return (
    <html lang="en" className={openSans.className}>
      <body className="overflow-hidden">
        <ThemeProvider>
          <ConfirmationModalContextProvider>
            <Toaster toastOptions={{ duration: 4000 }} />
            <ClientI18nProvider>
              <ClientSessionProvider session={session}>{children}</ClientSessionProvider>
            </ClientI18nProvider>
          </ConfirmationModalContextProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
