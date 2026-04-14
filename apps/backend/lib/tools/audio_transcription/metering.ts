import { randomUUID } from 'node:crypto'
import { OpenMeter } from '@openmeter/sdk'
import env from '@/lib/env'
import { logger } from '@/lib/logging'

type AudioTranscriptionEvent = {
  provider: string
  model: string
  toolId: string
  toolName: string
  userId?: string
  transcription_duration?: number | null
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

export const recordAudioTranscriptionEvent = async ({
  provider,
  model,
  toolId,
  toolName,
  userId,
  transcription_duration,
}: AudioTranscriptionEvent) => {
  if (!env.openmeter.baseUrl || !env.openmeter.apiKey || !env.openmeter.subject) {
    return
  }

  try {
    const openmeter = getOpenmeterClient()
    if (!openmeter) return

    await openmeter.events.ingest({
      type: 'audio_transcriptions',
      id: randomUUID(),
      source: 'logicle-backend',
      subject: env.openmeter.subject,
      time: new Date(),
      data: {
        provider,
        model,
        toolId,
        toolName,
        userId,
        transcription_duration: transcription_duration ?? null,
      },
    })
  } catch (error) {
    logger.warn('Failed recording audio transcription event', {
      provider,
      model,
      error: error instanceof Error ? error.message : `${error}`,
    })
  }
}
