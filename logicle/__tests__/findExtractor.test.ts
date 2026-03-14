import { describe, expect, test } from 'vitest'
import { findExtractor } from '@/lib/textextraction'

describe('findExtractor', () => {
  test('finds extractor for exact MIME type', () => {
    expect(findExtractor('application/pdf')).toBeDefined()
    expect(
      findExtractor(
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      )
    ).toBeDefined()
    expect(
      findExtractor('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    ).toBeDefined()
    expect(
      findExtractor(
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
      )
    ).toBeDefined()
  })

  test('finds generic extractor for text/* wildcard', () => {
    expect(findExtractor('text/plain')).toBeDefined()
    expect(findExtractor('text/csv')).toBeDefined()
    expect(findExtractor('text/html')).toBeDefined()
  })

  test('returns undefined for unknown MIME type', () => {
    expect(findExtractor('application/unknown-format')).toBeUndefined()
    expect(findExtractor('image/png')).toBeUndefined()
    expect(findExtractor('video/mp4')).toBeUndefined()
  })

  test('returns a callable function', () => {
    const extractor = findExtractor('application/pdf')
    expect(typeof extractor).toBe('function')
  })
})
