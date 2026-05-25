import { describe, expect, test } from 'vitest'
import { analyzeFileBuffer } from '@logicle/file-analyzer'

describe('analyzeFileBuffer — unknown MIME type sniffing', () => {
  test('marks a text file as isText=true', async () => {
    const buffer = Buffer.from('# Hello\nThis is a markdown file.\n')
    const result = await analyzeFileBuffer(buffer, 'application/octet-stream')
    expect(result.kind).toBe('unknown')
    if (result.kind === 'unknown') {
      expect(result.isText).toBe(true)
    }
  })

  test('marks a binary file as isText=false', async () => {
    const buffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x0a])
    const result = await analyzeFileBuffer(buffer, 'application/octet-stream')
    expect(result.kind).toBe('unknown')
    if (result.kind === 'unknown') {
      expect(result.isText).toBe(false)
    }
  })

  test('marks an empty file as isText=true', async () => {
    const result = await analyzeFileBuffer(Buffer.alloc(0), 'application/octet-stream')
    expect(result.kind).toBe('unknown')
    if (result.kind === 'unknown') {
      expect(result.isText).toBe(true)
    }
  })

})
