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
import { ChatPageContextProvider } from './chat/components/ChatPageContextProvider'
import * as fs from 'fs'
import * as path from 'path'
import { llmModels } from '@/lib/models'
import LayoutConfigProvider from '@/components/providers/layoutconfigContext'

const openSans = Red_Hat_Display({
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    template: `%s • ${env.appDisplayName}`,
    default: `${env.appDisplayName}`,
  },
}

const loadProvisionedStyles = async (dir: string) => {
  const children = fs.readdirSync(dir).sort()
  const readFile = async (name: string) => {
    const childPath = path.resolve(dir, name)
    return { name, content: await fs.promises.readFile(childPath, 'utf-8') }
  }
  return Promise.all(children.map((child) => readFile(child)))
}

const loadBrandI18n = async (dir: string) => {
  const childPath = path.resolve(dir, 'brand.json')
  try {
    await fs.promises.access(childPath)
  } catch {
    return {}
  }
  return JSON.parse(await fs.promises.readFile(childPath, 'utf-8'))
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
    backendConfigLock: env.backends.locked,
    ssoConfigLock: env.sso.locked,
    enableSignup: env.signup.enable,
    enableAutoSummary: env.chat.autoSummary.enable,
    enableChatSharing: env.chat.enableSharing,
    enableChatFolders: env.chat.enableFolders,
    enableShowToolResult: env.chat.enableShowToolResult,
    enableChatTreeNavigation: env.chat.enableTreeNavigation,
    maxImgAttachmentDimPx: env.chat.attachments.maxImgDimPx,
    enableApiKeys: env.apiKeys.enable,
    appUrl: env.appUrl,
    models: llmModels,
  }

  const styles = env.provision.brand ? await loadProvisionedStyles(env.provision.brand) : []
  const brand = env.provision.brand ? await loadBrandI18n(env.provision.brand) : {}
  return (
    <html className={openSans.className} translate="no">
      <head>
        <meta name="google" content="notranslate" />
        {styles.map((s) => {
          return <style key={s.name} dangerouslySetInnerHTML={{ __html: s.content }}></style>
        })}
      </head>
      <body className="overflow-hidden h-full">
        <ThemeProvider>
          <LayoutConfigProvider>
            <ConfirmationModalContextProvider>
              <Toaster toastOptions={{ duration: 4000 }} />
              <UserProfileProvider>
                <ClientI18nProvider brand={brand}>
                  <EnvironmentProvider value={environment}>
                    <ClientSessionProvider session={session}>
                      <ActiveWorkspaceProvider>
                        <ChatPageContextProvider>{children}</ChatPageContextProvider>
                      </ActiveWorkspaceProvider>
                    </ClientSessionProvider>
                  </EnvironmentProvider>
                </ClientI18nProvider>
              </UserProfileProvider>
            </ConfirmationModalContextProvider>
          </LayoutConfigProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
