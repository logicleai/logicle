'use client'

import { AssistantList } from '@/components/app/AssistantList'

export const dynamic = 'force-dynamic'

const Assistants = () => {
  return <AssistantList onlyMine={false} />
}

export default Assistants
