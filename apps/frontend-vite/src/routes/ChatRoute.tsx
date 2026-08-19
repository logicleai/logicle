import { useRef } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { ChatSection } from '@/app/chat/components/ChatSection'

const fakeChats = ['chat-alpha', 'chat-beta', 'chat-gamma']

// Real chat feature port: <ChatSection/> is the actual production source
// from apps/frontend/app/chat/components/ChatSection.tsx, imported
// unmodified — resolved through vite-tsconfig-paths against the same
// tsconfig.json paths table Next uses (see vite.config.ts). The providers it
// depends on (UserProfileProvider, ChatPageContextProvider, ...) are mounted
// once at RootLayout.tsx, matching production's own layout.tsx nesting — see
// that file's comment for why. The only things swapped are the two
// Next-only touchpoints (`@/lib/clientRouter`, `next/navigation`), aliased
// to React-Router-backed shims in vite.config.ts. Everything else — the
// chat run state machine, SSE streaming via services/chat.ts, SWR-backed
// profile/rate-limit/environment providers — is exercised against the real
// backend, same as production.
//
// ChatSection itself is rendered for both `/chat` and `/chat/:chatId` (one
// route, `chatId` optional, see router.tsx) — mirroring the real app's
// structure where both page.tsx files render the same <ChatSection/> and
// it's ChatPageContext (not the router) that decides compose vs.
// existing-chat view. That's what keeps this a single persisted component
// across the navigation, same as production — see
// ChatPageContextProvider.tsx's own comment.
export function ChatRoute() {
  const mountedAt = useRef(new Date().toLocaleTimeString()).current

  return (
    <div style={{ display: 'flex', height: 'calc(100vh - 24px)' }}>
      <aside style={{ width: 220, borderRight: '1px solid #ccc', padding: 12 }}>
        <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 12 }}>
          sidebar mounted at {mountedAt} (real ChatSection, real ChatPageContextProvider)
        </div>
        <Link to="/chat" style={{ display: 'block', marginBottom: 8 }}>
          + new chat
        </Link>
        {fakeChats.map((id) => (
          <NavLink
            key={id}
            to={`/chat/${id}`}
            style={({ isActive }) => ({
              display: 'block',
              padding: 4,
              fontWeight: isActive ? 'bold' : 'normal',
            })}
          >
            {id}
          </NavLink>
        ))}
        <hr style={{ margin: '12px 0' }} />
        <Link to="/admin/users">go to admin/users spike →</Link>
      </aside>
      <main style={{ flex: 1, overflow: 'auto' }}>
        <ChatSection />
      </main>
    </div>
  )
}
