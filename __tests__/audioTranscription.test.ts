import { describe, expect, test } from 'vitest'
import { AudioTranscriptionSchema } from '../packages/core/src/tools/schemas'
import { AudioTranscription } from '@/backend/lib/tools/audio_transcription/implementation'

const buildTool = (includeTimestamps?: boolean) =>
  new AudioTranscription(
    { id: 'tool-id', name: 'Audio Tool' } as any,
    AudioTranscriptionSchema.parse({
      apiKey: 'secret',
      ...(includeTimestamps === undefined ? {} : { includeTimestamps }),
    })
  )

describe('AudioTranscriptionSchema', () => {
  test('defaults includeTimestamps to true', () => {
    const parsed = AudioTranscriptionSchema.parse({ apiKey: 'secret' })
    expect(parsed.includeTimestamps).toBe(true)
  })
})

describe('AudioTranscription formatting', () => {
  test('includes truncated second timestamps when enabled', () => {
    const tool = buildTool(true) as any
    const output = tool.formatTranscript('meeting.mp3', {
      id: 'tr-1',
      status: 'completed',
      utterances: [
        { speaker: 'A', text: 'Hello', start: 250, end: 69129 },
        { speaker: 'B', text: 'Hi', start: 47000, end: 47009 },
      ],
    })

    const payload = JSON.parse(output.split('\n\n')[1]) as {
      transcript: Array<Record<string, unknown>>
    }
    expect(payload.transcript).toEqual([
      {
        speaker: 'SPEAKER A',
        text: 'Hello',
        start_time: 0.25,
        end_time: 69.12,
      },
      {
        speaker: 'SPEAKER B',
        text: 'Hi',
        start_time: 47,
        end_time: 47,
      },
    ])
  })

  test('omits timestamp fields when disabled', () => {
    const tool = buildTool(false) as any
    const output = tool.formatTranscript('meeting.mp3', {
      id: 'tr-2',
      status: 'completed',
      utterances: [{ speaker: 'A', text: 'Hello', start: 500, end: 1500 }],
    })

    const payload = JSON.parse(output.split('\n\n')[1]) as {
      transcript: Array<Record<string, unknown>>
    }
    expect(payload.transcript).toEqual([
      {
        speaker: 'SPEAKER A',
        text: 'Hello',
      },
    ])
  })

  test('gracefully omits missing timestamp values', () => {
    const tool = buildTool(true) as any
    const output = tool.formatTranscript('meeting.mp3', {
      id: 'tr-3',
      status: 'completed',
      utterances: [{ speaker: 'A', text: 'Hello' }],
    })

    const payload = JSON.parse(output.split('\n\n')[1]) as {
      transcript: Array<Record<string, unknown>>
    }
    expect(payload.transcript).toEqual([
      {
        speaker: 'SPEAKER A',
        text: 'Hello',
      },
    ])
  })
})
