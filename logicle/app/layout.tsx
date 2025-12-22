import { Toaster } from 'react-hot-toast'
import '../styles/globals.css'
import ConfirmationModalContextProvider from '@/components/providers/confirmationContext'
import ClientI18nProvider from './context/client-i18n-provider'
import ThemeProvider from '@/components/providers/themeContext'
import { Red_Hat_Display } from 'next/font/google'
import { Environment, EnvironmentProvider } from './context/environmentProvider'
import env from '@/lib/env'
import UserProfileProvider from '@/components/providers/userProfileContext'
import { ActiveWorkspaceProvider } from '@/components/providers/activeWorkspaceContext'
import { ChatPageContextProvider } from './chat/components/ChatPageContextProvider'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { llmModels } from '@/lib/models'
import LayoutConfigProvider from '@/components/providers/layoutconfigContext'
import { appVersion } from '@/lib/version'
import { getParameters } from '@/models/user'
import { Metadata } from 'next'

export const dynamic = 'force-dynamic'

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
    maxAttachmentSize: env.chat.attachments.maxSize,
    enableApiKeysUi: env.apiKeys.enableUi,
    enableAssistantInfo: env.assistants.enableInfo,
    enableAssistantDuplicate: env.assistants.enableDuplicate,
    appUrl: env.appUrl,
    models: llmModels,
    appVersion: appVersion,
    parameters: await getParameters(),
  }

  const styles = env.provision.brand ? await loadProvisionedStyles(env.provision.brand) : []
  const brand = env.provision.brand ? await loadBrandI18n(env.provision.brand) : {}
  return (
    <html className={openSans.className} translate="no">
      <head>
        <meta name="google" content="notranslate" />
        {styles.map((s) => {
          return <style key={s.name}>{s.content}</style>
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
                    <ActiveWorkspaceProvider>
                      <ChatPageContextProvider>{children}</ChatPageContextProvider>
                    </ActiveWorkspaceProvider>
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
