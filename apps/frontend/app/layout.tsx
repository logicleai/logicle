import { Toaster } from 'react-hot-toast'
import '../styles/globals.css'
import ConfirmationModalContextProvider from '@/components/providers/confirmationContext'
import ClientI18nProvider from './context/client-i18n-provider'
import ThemeProvider from '@/components/providers/themeContext'
import { Red_Hat_Display } from 'next/font/google'
import { EnvironmentProvider } from './context/environmentProvider'
import env from '@/lib/env'
import UserProfileProvider from '@/components/providers/userProfileContext'
import TokenRateLimitProvider from '@/components/providers/tokenRateLimitContext'
import SessionRefreshProvider from '@/components/providers/SessionRefreshProvider'
import { ActiveWorkspaceProvider } from '@/components/providers/activeWorkspaceContext'
import { ChatPageContextProvider } from './chat/components/ChatPageContextProvider'
import { ClientRouterProvider } from '@/lib/clientRouter'
import LayoutConfigProvider from '@/components/providers/layoutconfigContext'
import { Metadata } from 'next'

// This layout is fully static (no per-request server rendering — see
// `output: 'export'` in next.config.ts). The env bootstrap and brand
// CSS/i18n data it used to compute here are now spliced directly into the
// raw HTML string by server.ts as it serves each request (never rendered by
// React, to avoid a hydration mismatch between the static build and the
// per-request data). EnvironmentProvider/ClientI18nProvider read those
// spliced-in <script>/<style> tags back out on the client. See
// apps/backend/lib/app-config.ts (getEnvironmentPayload,
// getProvisionedBrandAssets) for what computes the data, and
// attachBootstrapInjection in apps/backend/server.ts for the splicing.

const openSans = Red_Hat_Display({
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    template: `%s • ${env.appDisplayName}`,
    default: `${env.appDisplayName}`,
  },
  icons: {
    icon: env.icons.favicon,
  },
}

export default function RootLayout({
  // Layouts must accept a children prop.
  // This will be populated with nested layouts or pages
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html className={openSans.className} translate="no">
      <head>
        <meta name="google" content="notranslate" />
      </head>
      <body className="overflow-hidden h-full">
        <ThemeProvider>
          <LayoutConfigProvider>
            <ConfirmationModalContextProvider>
              <Toaster toastOptions={{ duration: 4000 }} />
              <UserProfileProvider>
                <TokenRateLimitProvider>
                  <ClientI18nProvider>
                    <EnvironmentProvider>
                      <SessionRefreshProvider>
                        <ActiveWorkspaceProvider>
                          <ClientRouterProvider>
                            <ChatPageContextProvider>{children}</ChatPageContextProvider>
                          </ClientRouterProvider>
                        </ActiveWorkspaceProvider>
                      </SessionRefreshProvider>
                    </EnvironmentProvider>
                  </ClientI18nProvider>
                </TokenRateLimitProvider>
              </UserProfileProvider>
            </ConfirmationModalContextProvider>
          </LayoutConfigProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
