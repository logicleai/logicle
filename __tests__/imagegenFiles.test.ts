import { describe, expect, test } from 'vitest'
import {
  generatedImageExtensionForMimeType,
  normalizeGeneratedImageMimeType,
} from '@/backend/lib/imagegen/files'

describe('generated image file metadata', () => {
  test('keeps supported image mime types stable', () => {
    expect(normalizeGeneratedImageMimeType('image/webp')).toBe('image/webp')
    expect(generatedImageExtensionForMimeType('image/webp')).toBe('webp')
    expect(normalizeGeneratedImageMimeType('image/jpeg; charset=binary')).toBe('image/jpeg')
    expect(generatedImageExtensionForMimeType('image/jpeg')).toBe('jpg')
  })

  test('falls back to png for unknown or missing mime types', () => {
    expect(normalizeGeneratedImageMimeType(undefined)).toBe('image/png')
    expect(normalizeGeneratedImageMimeType('application/octet-stream')).toBe('image/png')
    expect(generatedImageExtensionForMimeType('application/octet-stream')).toBe('png')
  })
})
