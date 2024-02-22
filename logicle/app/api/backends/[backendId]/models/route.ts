import { requireAdmin } from '@/api/utils/auth'
import { getBackend } from 'models/backend'
import { NextResponse } from 'next/server'
import { ModelDetectionMode } from '@/db/types'
import { Provider, ProviderType as LLMosaicProviderType } from 'llmosaic'
import ApiResponses from '@/app/api/utils/ApiResponses'

export const dynamic = 'force-dynamic'

// Function to filter GPT models, this is just a temporary solution
function filterGptModels(backendResponse) {
  const gptModels = {
    ...backendResponse,
    data: backendResponse.data.filter((item) => item.id.startsWith('gpt')),
  }
  return gptModels
}

export const GET = requireAdmin(async (req: Request, route: { params: { backendId: string } }) => {
  const backend = await getBackend(route.params.backendId)
  if (!backend) {
    return ApiResponses.noSuchEntity()
  }
  if (backend.modelDetection === ModelDetectionMode.AUTO) {
    const llm = new Provider({
      apiKey: backend.apiKey,
      baseUrl: backend.endPoint,
      providerType: backend.providerType as LLMosaicProviderType,
    })
    let backendResponse = await llm.models()
    if (backend.endPoint.includes('https://api.openai.com')) {
      backendResponse = filterGptModels(backendResponse)
    }
    return NextResponse.json(backendResponse)
  } else {
    return ApiResponses.notImplemented('This backend does not support listing LLM models')
  }
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
