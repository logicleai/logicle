import { Outlet } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import ThemeProvider from '@/components/providers/themeContext'
import LayoutConfigProvider from '@/components/providers/layoutconfigContext'
import ConfirmationModalContextProvider from '@/components/providers/confirmationContext'
import UserProfileProvider from '@/components/providers/userProfileContext'
import TokenRateLimitProvider from '@/components/providers/tokenRateLimitContext'
import ClientI18nProvider from '@/app/context/client-i18n-provider'
import { EnvironmentProvider } from '@/app/context/environmentProvider'
import SessionRefreshProvider from '@/components/providers/SessionRefreshProvider'
import { ActiveWorkspaceProvider } from '@/components/providers/activeWorkspaceContext'
import { ChatPageContextProvider } from '@/app/chat/components/ChatPageContextProvider'
import { readEnvironment } from './bootstrap'

// Real counterpart to apps/frontend/app/layout.tsx — same provider stack,
// same nesting order, imported unmodified from the real app. Only
// ClientRouterProvider is dropped: React Router's own state (useLocation/
// useNavigate) replaces it entirely — see
// src/shims/clientRouterShim.tsx's comment for why that hand-rolled
// provider existed in the first place and why it has no counterpart here.
export function RootLayout() {
  const environment = readEnvironment()
  return (
    <div className="h-full">
      <div style={{ padding: 4, fontSize: 11, opacity: 0.5, borderBottom: '1px solid #ccc' }}>
        vite+react-router — appDisplayName from injected bootstrap: "
        {environment?.appDisplayName ?? '(none — dev mode has no server-side injector yet)'}"
      </div>
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
                        <ChatPageContextProvider>
                          <Outlet />
                        </ChatPageContextProvider>
                      </ActiveWorkspaceProvider>
                    </SessionRefreshProvider>
                  </EnvironmentProvider>
                </ClientI18nProvider>
              </TokenRateLimitProvider>
            </UserProfileProvider>
          </ConfirmationModalContextProvider>
        </LayoutConfigProvider>
      </ThemeProvider>
    </div>
  )
}
