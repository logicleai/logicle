import { requireSession } from '@/api/utils/auth'
import { getBackend } from '@/models/backend'
import { NextResponse } from 'next/server'
import ApiResponses from '@/app/api/utils/ApiResponses'
import { Session } from 'next-auth'
import { getModels } from '@/lib/chat/models'

export const dynamic = 'force-dynamic'

export const GET = requireSession(
  async (session: Session, req: Request, route: { params: { backendId: string } }) => {
    const backend = await getBackend(route.params.backendId)
    if (!backend) {
      return ApiResponses.noSuchEntity()
    }
    return NextResponse.json(getModels(backend.providerType))
  }
)
