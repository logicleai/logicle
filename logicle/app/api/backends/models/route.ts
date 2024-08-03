import { requireSession } from '@/api/utils/auth'
import { getBackends, getBackendsWithModels } from '@/models/backend'
import { NextResponse } from 'next/server'
import { Session } from 'next-auth'
import * as dto from '@/types/dto'

export const dynamic = 'force-dynamic'

export const GET = requireSession(async (session: Session, req: Request) => {
  const response: dto.BackendModels[] = await getBackendsWithModels()
  return NextResponse.json(response)
})

/*
else if (backend.modelDetection === ModelDetectionMode.FIXED) {
    let backendResponse
      switch (backend.providerType) {
        case ProviderType.Anthropic:
          backendResponse = {"object":"list","data":[{"id":"claude-2.1","object":"model","created":1686588896,"owned_by":"anthropic"},{"id":"claude-instant-1.2","object":"model","created":1687882411,"owned_by":"anthropic"}]}
          break
        default:
          backendResponse = {}
          break
      }
    return NextResponse.json(backendResponse)
  }
*/
