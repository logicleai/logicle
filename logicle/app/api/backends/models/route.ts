import { requireSession } from '@/api/utils/auth'
import { getBackend, getBackends } from '@/models/backend'
import { NextResponse } from 'next/server'
import { Provider, ProviderType as LLMosaicProviderType } from '@logicleai/llmosaic'
import ApiResponses from '@/app/api/utils/ApiResponses'
import { ModelDetectionMode } from '@/types/provider'
import { Session } from 'next-auth'
import { EnrichedModelList } from '@logicleai/llmosaic/dist/types'

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

interface BackendModel {
  backendId: string
  backendName: string
  models: EnrichedModelList
}

export const GET = requireSession(async (session: Session, req: Request) => {
  const backends = await getBackends()
  const response: BackendModel[] = []
  for (const backend of backends) {
    if (backend.modelDetection === ModelDetectionMode.AUTO) {
      const llm = new Provider({
        apiKey: backend.apiKey,
        baseUrl: backend.endPoint,
        providerType: backend.providerType as LLMosaicProviderType,
      })
      let models = await llm.models({ enrich: true })
      if (backend.endPoint.includes('https://api.openai.com')) {
        models = filterGptModels(models)
      }
      response.push({
        backendId: backend.id,
        backendName: backend.name,
        models: models,
      })
    }
  }
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
