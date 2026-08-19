import { Link } from 'react-router-dom'

const fakeUsers = [
  { id: 'user-1', name: 'Ada Lovelace' },
  { id: 'user-2', name: 'Grace Hopper' },
]

export function AdminUsersList() {
  return (
    <div>
      <h1>Users</h1>
      <ul>
        {fakeUsers.map((u) => (
          <li key={u.id}>
            {/* Plain <Link>, no `native` fallback needed — no blank-flash */}
            <Link to={`/admin/users/${u.id}`}>{u.name}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
