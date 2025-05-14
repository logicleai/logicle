import { Metadata } from 'next'

import { AssistantsAdminPage } from './components/AssistantsAdminPage'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Assistants',
}

export default async function Assistants() {
  return <AssistantsAdminPage />
}
