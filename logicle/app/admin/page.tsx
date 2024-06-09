import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const AdminLandingPage = () => {
  redirect('/admin/analytics')
  return <></>
}

export default AdminLandingPage
