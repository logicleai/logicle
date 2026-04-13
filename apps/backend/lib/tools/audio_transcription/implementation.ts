import {
  ToolBuilder,
  ToolFunctionContext,
  ToolFunctions,
  ToolImplementation,
  ToolInvokeParams,
  ToolParams,
} from '@/lib/chat/tools'
import {
  AudioTranscriptionInterface,
  AudioTranscriptionParams,
  AudioTranscriptionSchema,
} from '@/lib/tools/schemas'
import { LlmModel } from '@/lib/chat/models'
import * as dto from '@/types/dto'
import { expandToolParameter } from '@/backend/lib/tools/configSecrets'
import { getFileWithId } from '@/models/file'
import { storage } from '@/lib/storage'
import { recordAudioTranscriptionEvent } from './metering'

type AssemblyAiUploadResponse = {
  upload_url: string
}

type AssemblyAiUtterance = {
  speaker: string | number
  text: string
}

type AssemblyAiTranscriptResponse = {
  id: string
  status: 'queued' | 'processing' | 'completed' | 'error'
  error?: string | null
  text?: string | null
  language_code?: string | null
  audio_duration?: number | null
  utterances?: AssemblyAiUtterance[] | null
}

const DEFAULT_API_URL = 'https://api.eu.assemblyai.com'
const supportedAudioMedia = [
  'audio/mpeg',
  'audio/mp3',
  'audio/mp4',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'audio/ogg',
  'audio/flac',
  'audio/aac',
  'audio/m4a',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]

const sleep = async (ms: number) => await new Promise((resolve) => setTimeout(resolve, ms))

export class AudioTranscription
  extends AudioTranscriptionInterface
  implements ToolImplementation
{
  static builder: ToolBuilder = (toolParams: ToolParams, params: Record<string, unknown>) =>
    new AudioTranscription(toolParams, AudioTranscriptionSchema.parse(params))

  supportedMedia = supportedAudioMedia

  constructor(
    public toolParams: ToolParams,
    private params: AudioTranscriptionParams
  ) {
    super()
  }

  functions = async (_model: LlmModel, _context?: ToolFunctionContext) => this.functions_

  private functions_: ToolFunctions = {
    transcribe_audio: {
      description:
        'Transcribe an uploaded audio or video file by file id. Use this when the user asks for a transcript, speakers, or spoken content from an attachment.',
      parameters: {
        type: 'object',
        properties: {
          fileId: {
            type: 'string',
            description: 'ID of the uploaded audio or video file to transcribe',
          },
          language: {
            type: 'string',
            description:
              'Optional language code to force transcription language. Omit it to let the service detect the language.',
          },
          speakerLabels: {
            type: 'boolean',
            description:
              'Whether to separate the transcript by speaker when the input supports diarization.',
          },
        },
        required: ['fileId'],
        additionalProperties: false,
      },
      requireConfirm: false,
      invoke: this.invokeTranscription.bind(this),
    },
  }

  private getApiUrl() {
    return this.params.apiUrl ?? DEFAULT_API_URL
  }

  private async getHeaders() {
    const apiKey = await expandToolParameter(this.toolParams, this.params.apiKey)
    return {
      authorization: apiKey,
    }
  }

  private async invokeTranscription({
    params,
    userId,
  }: ToolInvokeParams): Promise<dto.ToolCallResultOutput> {
    const fileId = `${params.fileId ?? ''}`.trim()
    if (!fileId) {
      return { type: 'error-text', value: 'fileId is required' }
    }

    const fileEntry = await getFileWithId(fileId)
    if (!fileEntry) {
      return { type: 'error-text', value: `File not found: ${fileId}` }
    }

    const fileContent = await storage.readBuffer(fileEntry.path, !!fileEntry.encrypted)
    const headers = await this.getHeaders()

    try {
      const uploadResponse = await fetch(`${this.getApiUrl()}/v2/upload`, {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': fileEntry.type || 'application/octet-stream',
        },
        body: fileContent,
      })
      if (!uploadResponse.ok) {
        return {
          type: 'error-text',
          value: `AssemblyAI upload failed: ${uploadResponse.status} ${await uploadResponse.text()}`,
        }
      }

      const uploadBody = (await uploadResponse.json()) as AssemblyAiUploadResponse
      const speakerLabels =
        typeof params.speakerLabels === 'boolean'
          ? params.speakerLabels
          : this.params.speakerLabels
      const language =
        typeof params.language === 'string' && params.language.trim().length > 0
          ? params.language.trim()
          : this.params.defaultLanguage

      const transcriptCreateResponse = await fetch(`${this.getApiUrl()}/v2/transcript`, {
        method: 'POST',
        headers: {
          ...headers,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          audio_url: uploadBody.upload_url,
          speaker_labels: speakerLabels,
          language_code: language,
          language_detection: !language,
        }),
      })
      if (!transcriptCreateResponse.ok) {
        return {
          type: 'error-text',
          value: `AssemblyAI transcription request failed: ${transcriptCreateResponse.status} ${await transcriptCreateResponse.text()}`,
        }
      }

      const transcript = await this.pollTranscript(
        (
          (await transcriptCreateResponse.json()) as {
            id: string
          }
        ).id,
        headers
      )

      if (transcript.status === 'error') {
        return {
          type: 'error-text',
          value: transcript.error ?? 'Audio transcription failed',
        }
      }

      await recordAudioTranscriptionEvent({
        provider: 'assemblyai',
        model: 'assemblyai-speech-to-text',
        toolId: this.toolParams.id,
        toolName: this.toolParams.name,
        userId,
        durationSeconds:
          typeof transcript.audio_duration === 'number' ? transcript.audio_duration / 1000 : null,
      })

      return {
        type: 'content',
        value: [
          {
            type: 'text',
            text: this.formatTranscript(fileEntry.name, transcript),
          },
        ],
      }
    } catch (error) {
      return {
        type: 'error-text',
        value: error instanceof Error ? error.message : 'Audio transcription failed',
      }
    }
  }

  private async pollTranscript(
    transcriptId: string,
    headers: Record<string, string>
  ): Promise<AssemblyAiTranscriptResponse> {
    const startedAt = Date.now()
    while (Date.now() - startedAt < this.params.timeoutMs) {
      const response = await fetch(`${this.getApiUrl()}/v2/transcript/${transcriptId}`, {
        headers,
      })
      if (!response.ok) {
        throw new Error(
          `AssemblyAI transcription polling failed: ${response.status} ${await response.text()}`
        )
      }

      const body = (await response.json()) as AssemblyAiTranscriptResponse
      if (body.status === 'completed' || body.status === 'error') {
        return body
      }
      await sleep(this.params.pollIntervalMs)
    }

    throw new Error(`Audio transcription timed out after ${this.params.timeoutMs} ms`)
  }

  private formatTranscript(fileName: string, transcript: AssemblyAiTranscriptResponse) {
    const headerParts = [`Transcript for ${fileName}.`]
    if (transcript.language_code) {
      headerParts.push(`Detected language: ${transcript.language_code}.`)
    }
    if (typeof transcript.audio_duration === 'number') {
      headerParts.push(`Duration: ${(transcript.audio_duration / 1000).toFixed(1)} seconds.`)
    }

    const utterances =
      transcript.utterances?.map((utterance) => {
        const speaker = `${utterance.speaker}`.trim()
        const speakerLabel = speaker ? `SPEAKER ${speaker}` : 'SPEAKER'
        return `${speakerLabel}: ${utterance.text}`
      }) ?? []

    const textBody =
      utterances.length > 0
        ? utterances.join('\n')
        : (transcript.text?.trim() ?? 'No transcript text was returned.')

    return `${headerParts.join(' ')}\n\n${textBody}`
  }
}
