import { db } from 'db/database'
import * as dto from '@/types/dto'
import { nanoid } from 'nanoid'
import { Provider, ProviderType as LLMosaicProviderType } from '@logicleai/llmosaic'
import { ModelDetectionMode } from '@/types/provider'

const openai_models = [
  {
    name: 'GPT-4o',
    description:
      'Our most advanced, multimodal flagship model that’s cheaper and faster than GPT-4 Turbo. Currently points to gpt-4o-2024-05-13.',
    id: 'gpt-4o',
    object: 'model',
    created: 1698959748,
    owned_by: 'openai',
    context_length: 128000,
    tokenizer: 'o200k_base',
    capabilities: {
      vision: true,
      function_calling: true,
    },
    prices: {
      input: 5,
      output: 15,
    },
  },
  {
    name: 'GPT-4 Turbo',
    description:
      'GPT-4 Turbo with Vision. The latest GPT-4 Turbo model with vision capabilities. Vision requests can now use JSON mode and function calling. Currently points to gpt-4-turbo-2024-04-09',
    id: 'gpt-4-turbo',
    object: 'model',
    created: 1698959748,
    owned_by: 'openai',
    context_length: 128000,
    tokenizer: 'cl100k_base',
    capabilities: {
      vision: true,
      function_calling: true,
    },
    prices: {
      input: 10,
      output: 30,
    },
  },
  {
    name: 'GPT-4',
    description: 'Currently points to gpt-4-0613',
    id: 'gpt-4',
    object: 'model',
    created: 1698959748,
    owned_by: 'openai',
    context_length: 8192,
    tokenizer: 'cl100k_base',
    capabilities: {
      vision: false,
      function_calling: true,
    },
    prices: {
      input: 30,
      output: 60,
    },
  },
  {
    name: 'GPT-3.5 Turbo',
    description: 'Currently points to gpt-3.5-turbo-0125',
    id: 'gpt-3.5-turbo',
    object: 'model',
    created: 1698959748,
    owned_by: 'openai',
    context_length: 16385,
    tokenizer: 'cl100k_base',
    capabilities: {
      vision: false,
      function_calling: true,
    },
    prices: {
      input: 0.5,
      output: 1.5,
    },
  },
]

export const getBackends = async () => {
  return db.selectFrom('Backend').selectAll().execute()
}

export const getBackend = async (backendId: dto.Backend['id']) => {
  return db.selectFrom('Backend').selectAll().where('id', '=', backendId).executeTakeFirst()
}

export const createBackend = async (backend: dto.InsertableBackend) => {
  const id = nanoid()
  await db
    .insertInto('Backend')
    .values({
      ...backend,
      id: id,
    })
    .executeTakeFirstOrThrow()
  const created = await getBackend(id)
  if (!created) {
    throw new Error('Creation failed')
  }
  return created
}

export const updateBackend = async (id: string, data: object) => {
  if (Object.keys(data).length == 0) return []
  return db.updateTable('Backend').set(data).where('id', '=', id).execute()
}

export const deleteBackend = async (backendId: dto.Backend['id']) => {
  return db.deleteFrom('Backend').where('id', '=', backendId).executeTakeFirstOrThrow()
}

export const getBackendsWithModels = async (): Promise<dto.BackendModels[]> => {
  const backends = await getBackends()
  const result: dto.BackendModels[] = []
  for (const backend of backends) {
    try {
      if (backend.modelDetection === ModelDetectionMode.AUTO) {
        const llm = new Provider({
          apiKey: backend.apiKey,
          baseUrl: backend.endPoint,
          providerType: backend.providerType as LLMosaicProviderType,
        })
        let models = await llm.models({ enrich: true })
        if (backend.endPoint.includes('https://api.openai.com')) {
          models = {
            ...models,
            data: openai_models,
          }
        }
        result.push({
          backendId: backend.id,
          backendName: backend.name,
          models: models,
        })
      }
    } catch (e) {
      // this may happen for an invalid API key
      console.warn(`Failed reading models for backend ${backend.id}`)
    }
  }
  return result
}
