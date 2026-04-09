import { randomUUID } from 'node:crypto'
import { OpenMeter } from '@openmeter/sdk'
import env from '@/lib/env'
import { logger } from '@/lib/logging'

type ImageGenerationEvent = {
  provider: string
  model: string
  operation: 'generate' | 'edit'
  toolId: string
  toolName: string
  userId?: string
}

let openmeterClient: OpenMeter | null = null

const getOpenmeterClient = () => {
  if (!env.openmeter.baseUrl || !env.openmeter.apiKey) {
    return null
  }
  if (!openmeterClient) {
    openmeterClient = new OpenMeter({
      baseUrl: env.openmeter.baseUrl,
      apiKey: env.openmeter.apiKey,
    })
  }
  return openmeterClient
}

export const recordImageGenerationEvent = async ({
  provider,
  model,
  operation,
  toolId,
  toolName,
  userId,
}: ImageGenerationEvent) => {
  if (!env.openmeter.baseUrl || !env.openmeter.apiKey || !env.openmeter.subject) {
    return
  }

  try {
    const openmeter = getOpenmeterClient()
    if (!openmeter) return

    await openmeter.events.ingest({
      type: 'image_generation',
      id: randomUUID(),
      source: 'logicle-backend',
      subject: env.openmeter.subject,
      time: new Date(),
      data: {
        provider,
        model,
        operation,
        toolId,
        toolName,
        userId,
      },
    })
  } catch (error) {
    logger.warn('Failed recording image generation event', {
      provider,
      model,
      operation,
      error: error instanceof Error ? error.message : `${error}`,
    })
  }
}
