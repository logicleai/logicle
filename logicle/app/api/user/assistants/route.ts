import { UserAssistant } from '@/types/chat'
import { NextResponse } from 'next/server'
import Assistants from 'models/assistant'
import { requireSession } from '../../utils/auth'

export const dynamic = 'force-dynamic'

export const GET = requireSession(async (session) => {
  const assistants = await Assistants.withUserData(session!.user.id)
  const models = assistants.map((assistant) => {
    const model: UserAssistant = {
      id: assistant.id,
      name: assistant.name,
      description: assistant.description,
      icon: assistant.icon,
      pinned: assistant.pinned == 1,
      lastUsed: assistant.lastUsed,
    }
    return model
  })
  return NextResponse.json(models)
})
