import { describe, expect, test } from 'vitest'
import {
  extractExtension,
  mimeTypeOfFile,
  isValidMimeType,
  isMimeTypeAllowed,
} from '@/lib/mimeTypes'

describe('extractExtension', () => {
  test('returns extension with dot', () => {
    expect(extractExtension('file.txt')).toBe('.txt')
  })

  test('returns last extension for multi-dot filename', () => {
    expect(extractExtension('archive.tar.gz')).toBe('.gz')
  })

  test('returns null for no extension', () => {
    expect(extractExtension('README')).toBeNull()
  })
})

describe('mimeTypeOfFile', () => {
  test('returns mime type for known extension', () => {
    expect(mimeTypeOfFile('script.py')).toBe('text/x-python')
  })

  test('falls back to mime-types library for standard extensions', () => {
    expect(mimeTypeOfFile('image.png')).toBe('image/png')
  })

  test('returns empty string for unknown extension', () => {
    expect(mimeTypeOfFile('file.unknownxyz')).toBe('')
  })
})

describe('isValidMimeType', () => {
  test('valid type/subtype passes', () => {
    expect(isValidMimeType('image/png')).toBe(true)
    expect(isValidMimeType('application/json')).toBe(true)
  })

  test('wildcard subtype passes', () => {
    expect(isValidMimeType('image/*')).toBe(true)
    expect(isValidMimeType('*/*')).toBe(true)
  })

  test('missing slash fails', () => {
    expect(isValidMimeType('image')).toBe(false)
  })

  test('multiple slashes fail', () => {
    expect(isValidMimeType('image/png/extra')).toBe(false)
  })

  test('empty type or subtype fails', () => {
    expect(isValidMimeType('/png')).toBe(false)
    expect(isValidMimeType('image/')).toBe(false)
  })
})

describe('isMimeTypeAllowed', () => {
  test('exact match is allowed', () => {
    expect(isMimeTypeAllowed('image/png', ['image/png'])).toBe(true)
  })

  test('wildcard subtype matches any subtype', () => {
    expect(isMimeTypeAllowed('image/png', ['image/*'])).toBe(true)
    expect(isMimeTypeAllowed('image/jpeg', ['image/*'])).toBe(true)
  })

  test('wildcard type matches anything', () => {
    expect(isMimeTypeAllowed('video/mp4', ['*/*'])).toBe(true)
  })

  test('non-matching type is rejected', () => {
    expect(isMimeTypeAllowed('video/mp4', ['image/*'])).toBe(false)
  })

  test('non-matching subtype is rejected', () => {
    expect(isMimeTypeAllowed('image/jpeg', ['image/png'])).toBe(false)
  })

  test('empty allowed list rejects everything', () => {
    expect(isMimeTypeAllowed('image/png', [])).toBe(false)
  })

  test('invalid candidate mime type returns false', () => {
    expect(isMimeTypeAllowed('notamimetype', ['*/*'])).toBe(false)
  })

  test('matches any of multiple allowed types', () => {
    expect(isMimeTypeAllowed('application/pdf', ['image/png', 'application/pdf'])).toBe(true)
  })
})
