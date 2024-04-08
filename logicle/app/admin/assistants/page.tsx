import { Metadata } from 'next'

import { AssistantList } from '@/components/app/AssistantList'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Assistants',
}

export default async function Assistants() {
  return <AssistantList scope="admin" />
}
