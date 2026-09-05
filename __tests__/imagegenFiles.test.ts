import { describe, expect, test } from 'vitest'
import {
  generatedImageExtensionForMimeType,
  normalizeGeneratedImageMimeType,
  prepareImageForEditing,
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

  test('normalizes provider-supported source MIME parameters without changing the bytes', async () => {
    const source = Buffer.from('jpeg-bytes')

    await expect(
      prepareImageForEditing({
        data: source,
        fileName: 'photo.original',
        mimeType: 'image/jpg; charset=binary',
      })
    ).resolves.toEqual({
      data: source,
      fileName: 'photo.original',
      mimeType: 'image/jpeg',
    })
  })

  test('converts image formats unsupported by providers to PNG', async () => {
    const source = await (await import('sharp'))
      .default({
        create: {
          width: 1,
          height: 1,
          channels: 3,
          background: { r: 255, g: 0, b: 0 },
        },
      })
      .gif()
      .toBuffer()

    const prepared = await prepareImageForEditing({
      data: source,
      fileName: 'animation.gif',
      mimeType: 'image/gif',
    })

    expect(prepared.mimeType).toBe('image/png')
    expect(prepared.fileName).toBe('animation.png')
    expect(prepared.data.equals(source)).toBe(false)
  })

  test('rejects non-image source files before calling a provider', async () => {
    await expect(
      prepareImageForEditing({
        data: Buffer.from('not-an-image'),
        fileName: 'document.pdf',
        mimeType: 'application/pdf',
      })
    ).rejects.toThrow('Image editing requires an image file')
  })
})
