import { describe, expect, it } from 'vitest'
import { dtoMessageFromDbMessage } from '@/backend/models/utils'

describe('legacy tool message conversion', () => {
  it('converts null-version tool results with result attachments into content file parts', () => {
    const message = dtoMessageFromDbMessage({
      id: 'mHs8quoqfVsFhz5mTtmeR',
      conversationId: 'CMxAex0Xi0XU3oaxgnBJs',
      role: 'tool',
      parent: '2Dvr8d--RoRh4raTCfi25',
      sentAt: '2026-01-29T17:31:19.687Z',
      version: null,
      content: JSON.stringify({
        attachments: [
          {
            id: 'SeKQmXP9h9EZU1Op2skr-',
            mimetype: 'image/png',
            name: 'gsdYaG2U6IZUO-_47afgQ.png',
            size: 1254142,
          },
        ],
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'call_WgU9KQojFrhCWZ6629pqUc3U',
            toolName: 'GenerateImage',
            result: {
              result:
                "The tool displayed 1 images. The images are already plainly visible, so don't repeat the descriptions in detail.",
              attachments: [
                {
                  id: 'SeKQmXP9h9EZU1Op2skr-',
                  mimetype: 'image/png',
                  name: 'gsdYaG2U6IZUO-_47afgQ.png',
                  size: 1254142,
                },
              ],
            },
          },
        ],
      }),
    })

    expect(message.role).toBe('tool')
    if (message.role !== 'tool') {
      throw new Error('Expected tool message')
    }

    expect(message.parts).toHaveLength(1)
    const part = message.parts[0]
    expect(part.type).toBe('tool-result')
    if (part.type !== 'tool-result') {
      throw new Error('Expected tool-result part')
    }

    expect(part.result).toEqual({
      type: 'content',
      value: [
        {
          type: 'text',
          text: "The tool displayed 1 images. The images are already plainly visible, so don't repeat the descriptions in detail.",
        },
        {
          type: 'file',
          id: 'SeKQmXP9h9EZU1Op2skr-',
          mimetype: 'image/png',
          name: 'gsdYaG2U6IZUO-_47afgQ.png',
          size: 1254142,
        },
      ],
    })
  })

  it('converts version-3 tool message attachments into v4 content file parts', () => {
    const message = dtoMessageFromDbMessage({
      id: 'legacy-v3-tool',
      conversationId: 'conv',
      role: 'tool',
      parent: 'parent',
      sentAt: '2026-02-04T10:00:00.000Z',
      version: 3,
      content: JSON.stringify({
        attachments: [
          {
            id: 'file-1',
            mimetype: 'image/png',
            name: 'generated.png',
            size: 123,
          },
        ],
        parts: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            toolName: 'GenerateImage',
            result: {
              type: 'text',
              value: 'The tool displayed 1 images.',
            },
          },
        ],
      }),
    })

    expect(message.role).toBe('tool')
    if (message.role !== 'tool') {
      throw new Error('Expected tool message')
    }

    const part = message.parts[0]
    expect(part.type).toBe('tool-result')
    if (part.type !== 'tool-result') {
      throw new Error('Expected tool-result part')
    }

    expect(part.result).toEqual({
      type: 'content',
      value: [
        {
          type: 'text',
          text: 'The tool displayed 1 images.',
        },
        {
          type: 'file',
          id: 'file-1',
          mimetype: 'image/png',
          name: 'generated.png',
          size: 123,
        },
      ],
    })
  })
})
