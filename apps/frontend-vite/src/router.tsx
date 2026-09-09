import type { ComponentType } from 'react'
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RootLayout } from './RootLayout'
import { RouteError } from './RouteError'
import {
  AdminRouteLayout,
  MeRouteLayout,
  ChatRouteLayout,
  ImagesRouteLayout,
  SatellitesRouteLayout,
  AuthRouteLayout,
  MobileChatOnlyRoute,
  MobileAssistantManagementRoute,
} from './layoutAdapters'

// Full route tree, mechanically ported from apps/frontend/app/**/page.tsx +
// layout.tsx (Next's filesystem router) — every leaf below is the real
// production component, imported unmodified. Two conventions from the real
// app carry over directly:
//   - a `[dynamicSegment]/page.tsx` is always a thin Next-only wrapper (only
//     needed for `generateStaticParams`, irrelevant here) around a sibling
//     PageClient.tsx that does the actual work — so routes import
//     PageClient.tsx directly, skipping the wrapper.
//   - a static `page.tsx` that isn't already 'use client' itself is an
//     `async function` Server-Component wrapper (only needed to attach
//     Next's `metadata` export) around a named sibling component — same
//     deal, import the named component directly. Feeding the `async
//     function` wrapper itself to React Router would break: React DOM
//     doesn't accept a Promise from a plain (non-RSC) component render.
// Layout nesting matches the real app/**/layout.tsx tree via the adapters
// in layoutAdapters.tsx (each just supplies <Outlet/> as the real layout's
// `children` prop). See the top of ChatSection's route entry below for why
// `chat/:chatId?` — one route with an optional dynamic segment — replaces
// separate index/:chatId children: it's what keeps ChatSection a single
// persisted instance across that navigation, same as production.
//
// Every leaf uses React Router's `lazy` route field instead of a static
// import, so each route's module graph is its own chunk, loaded only when
// that route is actually visited. Two reasons, not one: it's what keeps the
// production build from shipping a single ~9MB entry chunk (every route's
// dependencies eagerly bundled together), and it isolates any one route's
// broken dependency to that one route's chunk instead of poisoning the
// app's entire static import graph — this is what contained
// admin/tools/create's crash (see RouteError.tsx) to a friendly error page
// while it was still broken, before vite.config.ts's nodePolyfills actually
// fixed the underlying @readme/openapi-parser incompatibility.
const page = (loader: () => Promise<{ default: ComponentType }>) => ({
  lazy: () => loader().then((m) => ({ Component: m.default })),
})
const named = <T extends string>(name: T) =>
  function <M extends Record<T, ComponentType>>(loader: () => Promise<M>) {
    return { lazy: () => loader().then((m) => ({ Component: m[name] })) }
  }

export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    // Catches errors thrown by any descendant route's lazy module — at
    // import time (a route's dependency crashing during module evaluation)
    // or during render — instead of React Router's raw default error
    // screen. See RouteError.tsx's own comment.
    errorElement: <RouteError />,
    children: [
      { index: true, element: <Navigate to="/chat" replace /> },

      {
        element: <AuthRouteLayout />,
        children: [
          // Unlike most page.tsx files here, this one is genuinely
          // 'use client' with real logic (fetches SSO connection config
          // before rendering LoginPanel) — not a metadata-only wrapper — so
          // it's imported as-is, same as the assistants/select & mine pages.
          { path: 'auth/login', ...page(() => import('@/app/auth/login/page')) },
          { path: 'auth/join', ...page(() => import('@/app/auth/join/SignUpPanel')) },
        ],
      },

      {
        element: <ChatRouteLayout />,
        children: [
          // A single route with an optional dynamic segment (RR v6.9+), not
          // nested index/:chatId children — see the top-of-file comment.
          {
            path: 'chat/:chatId?',
            ...named('ChatSection')(() => import('@/app/chat/components/ChatSection')),
          },
          {
            path: 'chat/assistants/select',
            ...page(() => import('@/app/chat/assistants/select/page')),
          },
          {
            element: <MobileAssistantManagementRoute />,
            children: [
              {
                path: 'chat/assistants/mine',
                ...page(() => import('@/app/chat/assistants/mine/page')),
              },
            ],
          },
          {
            path: 'chat/folders/:folderId',
            ...page(() => import('@/app/chat/folders/[folderId]/PageClient')),
          },
        ],
      },

      {
        element: <MobileChatOnlyRoute />,
        children: [
          {
            element: <ImagesRouteLayout />,
            children: [{ path: 'images', ...page(() => import('@/app/images/page')) }],
          },
          {
            element: <SatellitesRouteLayout />,
            children: [
              { path: 'satellites', ...page(() => import('@/app/satellites/page')) },
              { path: 'satellites/create', element: <Navigate to="/satellites" replace /> },
              { path: 'satellites/:id', ...page(() => import('@/app/satellites/[id]/PageClient')) },
            ],
          },
          { path: 'assistants/:id', ...page(() => import('@/app/assistants/[id]/PageClient')) },
          {
            path: 'assistants/:id/history',
            ...page(() => import('@/app/assistants/[id]/history/PageClient')),
          },
          { path: 'share/:shareId', ...page(() => import('@/app/share/[shareId]/PageClient')) },
          { path: 'internals/palette', ...page(() => import('@/app/internals/palette/page')) },
          {
            path: 'internals/styleguide',
            ...page(() => import('@/app/internals/styleguide/page')),
          },
          {
            element: <AdminRouteLayout />,
            children: [
              { path: 'admin', element: <Navigate to="/admin/analytics" replace /> },
              {
                path: 'admin/analytics',
                ...page(() => import('@/app/admin/analytics/AnalyticsPage')),
              },
              {
                path: 'admin/assistants',
                ...named('AssistantsAdminPage')(
                  () => import('@/app/admin/assistants/components/AssistantsAdminPage')
                ),
              },
              {
                path: 'admin/backends',
                ...named('BackendsPage')(() => import('@/app/admin/backends/BackendsPage')),
              },
              {
                path: 'admin/backends/create',
                ...page(() => import('@/app/admin/backends/create/page')),
              },
              {
                path: 'admin/backends/:id',
                ...page(() => import('@/app/admin/backends/[id]/PageClient')),
              },
              {
                path: 'admin/organization',
                ...page(() => import('@/app/admin/organization/page')),
              },
              { path: 'admin/satellites', ...page(() => import('@/app/admin/satellites/page')) },
              {
                path: 'admin/satellites/create',
                ...page(() => import('@/app/admin/satellites/create/page')),
              },
              {
                path: 'admin/satellites/:id',
                ...page(() => import('@/app/admin/satellites/[id]/PageClient')),
              },
              {
                path: 'admin/settings',
                ...page(() => import('@/app/admin/settings/AppSettingsPage')),
              },
              { path: 'admin/sso', ...page(() => import('@/app/admin/sso/SSOPage')) },
              {
                path: 'admin/sso/:clientId',
                ...page(() => import('@/app/admin/sso/[clientId]/PageClient')),
              },
              { path: 'admin/tools', ...page(() => import('@/app/admin/tools/page')) },
              {
                path: 'admin/tools/create',
                ...page(() => import('@/app/admin/tools/create/page')),
              },
              {
                path: 'admin/tools/:id',
                ...page(() => import('@/app/admin/tools/[id]/PageClient')),
              },
              { path: 'admin/users', ...page(() => import('@/app/admin/users/UsersPage')) },
              {
                path: 'admin/users/:userId',
                ...page(() => import('@/app/admin/users/[userId]/PageClient')),
              },
              {
                path: 'admin/workspaces',
                ...page(() => import('@/app/admin/workspaces/components/WorkspacesPage')),
              },
              {
                path: 'admin/workspaces/:workspaceId',
                ...page(() => import('@/app/admin/workspaces/[workspaceId]/PageClient')),
              },
            ],
          },
          {
            element: <MeRouteLayout />,
            children: [
              { path: 'me/apikeys', ...page(() => import('@/app/me/apikeys/page')) },
              {
                path: 'me/parameters',
                ...named('ParametersPage')(() => import('@/app/me/components/ParametersPage')),
              },
              {
                path: 'me/password',
                ...named('UpdatePasswordPage')(
                  () => import('@/app/me/components/UpdatePasswordPage')
                ),
              },
              {
                path: 'me/preferences',
                ...named('UserPreferencesPage')(
                  () => import('@/app/me/components/UserPreferencesPage')
                ),
              },
              {
                path: 'me/profile',
                ...named('ProfilePage')(() => import('@/app/me/components/ProfilePage')),
              },
              { path: 'me/secrets', ...page(() => import('@/app/me/secrets/page')) },
              { path: 'me/sessions', ...page(() => import('@/app/me/sessions/page')) },
            ],
          },
        ],
      },

      // Genuinely unmatched URL — see RouteError.tsx's `notFound` branch.
      { path: '*', element: <RouteError /> },
    ],
  },
])
