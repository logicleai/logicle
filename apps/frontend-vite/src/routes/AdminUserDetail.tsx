import { useParams, Link } from 'react-router-dom'

export function AdminUserDetail() {
  const { userId } = useParams()
  return (
    <div>
      <Link to="/admin/users">← back</Link>
      <h1>User detail: {userId}</h1>
    </div>
  )
}
