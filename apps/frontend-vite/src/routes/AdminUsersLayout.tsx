import { useRef } from 'react'
import { Outlet } from 'react-router-dom'

// Same persistence proof as ChatRoute, for a plain list→detail pair (the
// common case components/ui/link.tsx's `native` prop exists for today).
export function AdminUsersLayout() {
  const mountedAt = useRef(new Date().toLocaleTimeString()).current
  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 11, opacity: 0.6, marginBottom: 12 }}>
        admin/users shell mounted at {mountedAt} — should never change while navigating list ↔ detail
      </div>
      <Outlet />
    </div>
  )
}
