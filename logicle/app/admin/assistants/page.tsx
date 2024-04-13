import { Metadata } from 'next'

import { AssistantsPage } from './components/AssistantsPage'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Assistants',
}

export default async function Assistants() {
  return <AssistantsPage />
}
