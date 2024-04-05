'use client'

import { AssistantList } from '@/components/app/AssistantList'

export const dynamic = 'force-dynamic'

const UserAssistants = () => {
  return <AssistantList onlyMine={true} />
}

export default UserAssistants
