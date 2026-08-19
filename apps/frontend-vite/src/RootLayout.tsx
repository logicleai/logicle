import { Outlet } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import UserProfileProvider from '@/components/providers/userProfileContext'
import TokenRateLimitProvider from '@/components/providers/tokenRateLimitContext'
import ClientI18nProvider from '@/app/context/client-i18n-provider'
import { EnvironmentProvider } from '@/app/context/environmentProvider'
import { ChatPageContextProvider } from '@/app/chat/components/ChatPageContextProvider'
import { readEnvironment } from './bootstrap'

// Spike counterpart to apps/frontend/app/layout.tsx. Real production nests
// ChatPageContextProvider at this same root level (wrapping the *entire*
// app, not just /chat) — that's what lets a route like
// /chat/assistants/select set newChatAssistantId and navigate back to /chat
// without losing state, since ChatPageContextProvider itself never unmounts
// for either. Mirrored here for the same reason. ThemeProvider,
// LayoutConfigProvider, ConfirmationModalContextProvider,
// SessionRefreshProvider, ActiveWorkspaceProvider from the real layout are
// omitted — none of them are router-coupled, so they're irrelevant to what
// this spike is proving. Only ClientRouterProvider from that list is gone
// for a real reason: React Router's own state replaces it entirely (see
// src/shims/clientRouterShim.tsx).
export function RootLayout() {
  const environment = readEnvironment()
  return (
    <div className="h-full">
      <div style={{ padding: 4, fontSize: 11, opacity: 0.5, borderBottom: '1px solid #ccc' }}>
        vite+react-router spike — appDisplayName from injected bootstrap: "
        {environment?.appDisplayName ?? '(none — dev mode has no server-side injector yet)'}"
      </div>
      <UserProfileProvider>
        <TokenRateLimitProvider>
          <ClientI18nProvider>
            <EnvironmentProvider>
              <ChatPageContextProvider>
                <Toaster toastOptions={{ duration: 4000 }} />
                <Outlet />
              </ChatPageContextProvider>
            </EnvironmentProvider>
          </ClientI18nProvider>
        </TokenRateLimitProvider>
      </UserProfileProvider>
    </div>
  )
}
