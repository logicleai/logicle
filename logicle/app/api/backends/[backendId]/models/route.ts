import { requireSession, SimpleSession } from '@/api/utils/auth'
import { getBackend } from '@/models/backend'
import { NextResponse } from 'next/server'
import ApiResponses from '@/app/api/utils/ApiResponses'
import { llmModels } from '@/lib/models'

export const dynamic = 'force-dynamic'

export const GET = requireSession(
  async (session: SimpleSession, req: Request, params: { backendId: string }) => {
    const backend = await getBackend(params.backendId)
    if (!backend) {
      return ApiResponses.noSuchEntity()
    }
    return NextResponse.json(llmModels.filter((m) => m.id == backend.providerType))
  }
)
