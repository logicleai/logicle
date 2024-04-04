import { requireAdmin } from '@/api/utils/auth'
import { getBackend } from 'models/backend'
import { NextResponse } from 'next/server'
import { Provider, ProviderType as LLMosaicProviderType } from '@logicleai/llmosaic'
import ApiResponses from '@/app/api/utils/ApiResponses'
import { ModelDetectionMode } from '@/types/provider'
import env from '@/lib/env'

export const dynamic = 'force-dynamic'

// Function to filter only specific GPT models
function filterGptModels(backendResponse) {
  const allowedGptModels = ['gpt-4-turbo-preview', 'gpt-4', 'gpt-4-32k', 'gpt-3.5-turbo']

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
    let backendResponse = await llm.models({enrich: false})
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
