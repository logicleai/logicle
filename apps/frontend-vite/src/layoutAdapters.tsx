import { Navigate, Outlet } from 'react-router-dom'
import AdminLayout from '@/app/admin/layout'
import MeLayout from '@/app/me/layout'
import ChatLayout from '@/app/chat/layout'
import ImagesLayout from '@/app/images/layout'
import SatellitesLayout from '@/app/satellites/layout'
import AuthPageLayout from '@/app/auth/layout'
import { useLayoutConfig } from '@/components/providers/layoutconfigContext'

// Real Next layout.tsx files all take a `children: ReactNode` prop (Next's
// App Router convention) rather than rendering an <Outlet/> themselves —
// there's nothing React-Router-specific about that shape, so no edits are
// needed to the real files; each adapter here just supplies <Outlet/> as
// that prop, exactly like a component author fully in control of the render
// tree would. This is the same trick router.tsx's `chat/:chatId?` uses for
// ChatSection, generalized to every other section of the app.
export const AdminRouteLayout = () => (
  <AdminLayout>
    <Outlet />
  </AdminLayout>
)

export const MeRouteLayout = () => (
  <MeLayout>
    <Outlet />
  </MeLayout>
)

export const ChatRouteLayout = () => (
  <ChatLayout>
    <Outlet />
  </ChatLayout>
)

export const ImagesRouteLayout = () => (
  <ImagesLayout>
    <Outlet />
  </ImagesLayout>
)

export const SatellitesRouteLayout = () => (
  <SatellitesLayout>
    <Outlet />
  </SatellitesLayout>
)

export const AuthRouteLayout = () => (
  <AuthPageLayout>
    <Outlet />
  </AuthPageLayout>
)

// On phones Logicle deliberately exposes a focused chat experience, including
// when somebody opens an old admin or management bookmark directly.
export const MobileChatOnlyRoute = () => {
  const { isMobile } = useLayoutConfig()
  return isMobile ? <Navigate to="/chat" replace /> : <Outlet />
}

export const MobileAssistantManagementRoute = () => {
  const { isMobile } = useLayoutConfig()
  return isMobile ? <Navigate to="/chat/assistants/select" replace /> : <Outlet />
}
