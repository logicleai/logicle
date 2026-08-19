import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RootLayout } from './RootLayout'
import { ChatRoute } from './routes/ChatRoute'
import { AdminUsersLayout } from './routes/AdminUsersLayout'
import { AdminUsersList } from './routes/AdminUsersList'
import { AdminUserDetail } from './routes/AdminUserDetail'
import { AuthLogin } from './routes/AuthLogin'
import { AssistantsSelectRoute } from './routes/AssistantsSelectRoute'

// Spike counterpart to apps/frontend/**/page.tsx + layout.tsx (Next's
// filesystem router). The point being proven here: React Router's nested
// <Outlet/> layouts keep a parent route's component instance mounted across
// a navigation to a child route — including one with a dynamic segment
// (:chatId, :userId) — with zero extra machinery. That's a native
// replacement for two hand-rolled workarounds this app currently needs
// under Next's static export:
//   - lib/clientRouter.tsx (chat's own history.pushState hack, because
//     Next's router can't soft-navigate into a dynamic segment it has no
//     build-time payload for)
//   - the `native` prop on components/ui/link.tsx (falling back to a plain
//     <a> for any other link into a dynamic segment, to avoid the blank-flash
//     unmount Next's router causes when it discovers the same thing)
// See ChatRoute.tsx/AdminUsersLayout.tsx for where the persistence is
// demonstrated — ChatRoute goes further and renders the *real* production
// chat feature (ChatSection.tsx + ChatPageContextProvider.tsx, unmodified)
// against the real backend, not a stand-in.
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Navigate to="/chat" replace /> },
      { path: 'auth/login', element: <AuthLogin /> },
      // A single route with an optional dynamic segment (RR v6.9+), not
      // nested index/:chatId children — see ChatRoute.tsx's comment for why
      // that distinction is what keeps the real ChatPageContextProvider a
      // single persisted instance across the compose ↔ existing-chat switch.
      { path: 'chat/:chatId?', element: <ChatRoute /> },
      // Real production page (apps/frontend/app/chat/assistants/select),
      // imported unmodified — a new user with no lastUsedAssistant lands
      // here via ChatSection's own redirect() call (shimmed in
      // src/shims/nextNavigationShim.tsx). Proves the provider-at-root
      // restructure in RootLayout.tsx: ChatPageContextProvider must survive
      // this navigation for setNewChatAssistantId to work.
      { path: 'chat/assistants/select', element: <AssistantsSelectRoute /> },
      {
        path: 'admin/users',
        element: <AdminUsersLayout />,
        children: [
          { index: true, element: <AdminUsersList /> },
          { path: ':userId', element: <AdminUserDetail /> },
        ],
      },
    ],
  },
])
