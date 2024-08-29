import { requireSession } from '@/api/utils/auth'
import { getBackend } from '@/models/backend'
import { NextResponse } from 'next/server'
import ApiResponses from '@/app/api/utils/ApiResponses'
import { Session } from 'next-auth'
import { getModels } from '@/lib/openai/models'

export const dynamic = 'force-dynamic'

// Function to filter only specific GPT models
function filterGptModels(backendResponse) {
  const allowedGptModels = ['gpt-4o', 'gpt-4-turbo', 'gpt-4', 'gpt-4-32k', 'gpt-3.5-turbo']

  // Map over the allowedGptModels and, for each one, find the corresponding model in backendResponse.data
  const reorderedModels = allowedGptModels
    .map((allowedModel) => backendResponse.data.find((item) => item.id === allowedModel))
    .filter((item) => item !== undefined) // Filter out any undefined entries (in case some models aren't in the response)

  const filteredModels = {
    ...backendResponse,
    data: reorderedModels,
  }

  return filteredModels
}

export const GET = requireSession(
  async (session: Session, req: Request, route: { params: { backendId: string } }) => {
    const backend = await getBackend(route.params.backendId)
    if (!backend) {
      return ApiResponses.noSuchEntity()
    }
    return NextResponse.json(getModels(backend.providerType))
  }
)

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
