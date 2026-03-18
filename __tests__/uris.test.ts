import { describe, expect, test } from 'vitest'
import { splitDataUri, toDataUri } from '@/lib/uris'

describe('toDataUri', () => {
  test('produces correct data URI format', () => {
    const data = Buffer.from('hello')
    const uri = toDataUri(data, 'text/plain')
    expect(uri).toBe(`data:text/plain;base64,${data.toString('base64')}`)
  })
})

describe('splitDataUri', () => {
  test('extracts mime type and data', () => {
    const data = Buffer.from('hello')
    const uri = `data:text/plain;base64,${data.toString('base64')}`
    const result = splitDataUri(uri)
    expect(result.mimeType).toBe('text/plain')
    expect(result.data).toEqual(data)
  })

  test('round-trips through toDataUri', () => {
    const original = Buffer.from('binary \x00\x01\x02 data')
    const mimeType = 'application/octet-stream'
    const uri = toDataUri(original, mimeType)
    const { data, mimeType: parsedMime } = splitDataUri(uri)
    expect(parsedMime).toBe(mimeType)
    expect(data).toEqual(original)
  })
})
