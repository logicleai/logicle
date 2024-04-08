import WorkspacesPage from './WorkspacesPage'
import { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Workspaces',
}

export default async function AppSettings() {
  return <WorkspacesPage />
}
