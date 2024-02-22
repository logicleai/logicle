import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

const AdminLandingPage = () => {
  redirect('/admin/assistants')
  return <></>
}

export default AdminLandingPage
