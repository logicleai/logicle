import { describe, expect, test } from 'vitest'
import { sortAssistantFiles, type AssistantFile } from '@/types/dto/assistant'

describe('sortAssistantFiles', () => {
  test('prioritizes explicit order values', () => {
    const files: AssistantFile[] = [
      { id: 'c', name: 'c', type: 'text/plain', size: 1, createdAt: '2026-01-03T00:00:00.000Z' },
      {
        id: 'b',
        name: 'b',
        type: 'text/plain',
        size: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        order: 2,
      },
      {
        id: 'a',
        name: 'a',
        type: 'text/plain',
        size: 1,
        createdAt: '2026-01-02T00:00:00.000Z',
        order: 1,
      },
    ]

    expect(sortAssistantFiles(files).map((f) => f.id)).toEqual(['a', 'b', 'c'])
  })

  test('falls back to createdAt for legacy files without order', () => {
    const files: AssistantFile[] = [
      { id: 'b', name: 'b', type: 'text/plain', size: 1, createdAt: '2026-01-02T00:00:00.000Z' },
      { id: 'a', name: 'a', type: 'text/plain', size: 1, createdAt: '2026-01-01T00:00:00.000Z' },
    ]

    expect(sortAssistantFiles(files).map((f) => f.id)).toEqual(['a', 'b'])
  })

  test('uses stable id tie-breaker for mixed and equal values', () => {
    const files: AssistantFile[] = [
      {
        id: 'b',
        name: 'b',
        type: 'text/plain',
        size: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        order: 1,
      },
      {
        id: 'a',
        name: 'a',
        type: 'text/plain',
        size: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        order: 1,
      },
      { id: 'd', name: 'd', type: 'text/plain', size: 1, createdAt: '2026-01-01T00:00:00.000Z' },
      { id: 'c', name: 'c', type: 'text/plain', size: 1, createdAt: '2026-01-01T00:00:00.000Z' },
    ]

    expect(sortAssistantFiles(files).map((f) => f.id)).toEqual(['a', 'b', 'c', 'd'])
  })
})
