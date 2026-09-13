import { Outlet, useLocation } from 'react-router-dom'
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

// Real counterpart to apps/frontend/app/layout.tsx — same provider stack,
// same nesting order, imported unmodified from the real app. Only
// ClientRouterProvider is dropped: React Router's own state (useLocation/
// useNavigate) replaces it entirely — see
// src/shims/clientRouterShim.tsx's comment for why that hand-rolled
// provider existed in the first place and why it has no counterpart here.
export function RootLayout() {
  const { pathname } = useLocation()
  const isPublicAuthRoute = pathname.startsWith('/auth/')

  return (
    <div className="h-full">
      <ThemeProvider>
        <LayoutConfigProvider>
          <ConfirmationModalContextProvider>
            <Toaster toastOptions={{ duration: 4000 }} />
            <EnvironmentProvider>
              {isPublicAuthRoute ? (
                <ClientI18nProvider>
                  <Outlet />
                </ClientI18nProvider>
              ) : (
                <UserProfileProvider>
                  <TokenRateLimitProvider>
                    <ClientI18nProvider>
                      <SessionRefreshProvider>
                        <ActiveWorkspaceProvider>
                          <ChatPageContextProvider>
                            <Outlet />
                          </ChatPageContextProvider>
                        </ActiveWorkspaceProvider>
                      </SessionRefreshProvider>
                    </ClientI18nProvider>
                  </TokenRateLimitProvider>
                </UserProfileProvider>
              )}
            </EnvironmentProvider>
          </ConfirmationModalContextProvider>
        </LayoutConfigProvider>
      </ThemeProvider>
    </div>
  )
}
