import { describe, expect, it } from 'vitest'
import { materializeReferenceChat } from '@/backend/lib/eval/referenceChat'

describe('materializeReferenceChat', () => {
  it('builds a parent-linked DTO history with attachments and tool traffic', () => {
    const history = materializeReferenceChat(
      {
        history: [
          { role: 'user', text: 'read this', attachments: ['record.txt'] },
          {
            role: 'assistant',
            text: 'checking',
            toolCall: { id: 'call-1', name: 'lookup', args: { key: 'x' } },
          },
          { role: 'tool', toolCallId: 'call-1', toolName: 'lookup', result: 'result' },
        ],
        finalUserMessage: 'what was it?',
      },
      {
        conversationId: 'conversation',
        runId: 'run',
        corpus: [{ name: 'record.txt', mimeType: 'text/plain', text: 'body' }],
        files: [{ id: 'file-1', name: 'record.txt', type: 'text/plain', size: 4 }],
      }
    )

    expect(history.map((message) => message.role)).toEqual(['user', 'assistant', 'tool'])
    expect(history[0]).toMatchObject({
      attachments: [{ id: 'file-1', name: 'record.txt', mimetype: 'text/plain', size: 4 }],
    })
    expect(history[1]!.parent).toBe(history[0]!.id)
    expect(history[2]!.parent).toBe(history[1]!.id)
  })

  it('fails loudly when a saved attachment is not in the corpus', () => {
    expect(() =>
      materializeReferenceChat(
        {
          history: [{ role: 'user', text: 'read', attachments: ['missing.txt'] }],
          finalUserMessage: 'what?',
        },
        { conversationId: 'c', runId: 'r', corpus: [], files: [] }
      )
    ).toThrow('missing from the scenario corpus')
  })
})
