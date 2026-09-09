import { describe, expect, test } from 'vitest'
import { parseCustomWidget } from '@/lib/widgets/parseCustomWidget'

describe('parseCustomWidget', () => {
  test('parses an image-compare fence body', () => {
    const r = parseCustomWidget(`
type: image-compare
items:
  - fileId: "file_abc123"
    label: Nuova
    alt: Versione nuova
  - fileId: "file_def456"
    label: Originale
`)
    expect(r).toEqual({
      ok: true,
      spec: {
        type: 'image-compare',
        items: [
          { fileId: 'file_abc123', label: 'Nuova', alt: 'Versione nuova' },
          { fileId: 'file_def456', label: 'Originale' },
        ],
      },
    })
  })

  test('parses an image-carousel fence body', () => {
    const r = parseCustomWidget(`
type: image-carousel
items:
  - fileId: a
  - fileId: b
    label: Side
`)
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    expect(r.spec.type).toBe('image-carousel')
    expect(r.spec.items).toHaveLength(2)
  })

  test('failsafe schema keeps scalars as strings (no "Norway problem")', () => {
    const r = parseCustomWidget(`
type: image-carousel
items:
  - fileId: "1"
    label: "No"
  - fileId: "2"
    label: "3.0"
`)
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error(r.error)
    expect(r.spec.items[0].label).toBe('No')
    expect(r.spec.items[1].label).toBe('3.0')
  })

  test('strips unknown keys instead of failing', () => {
    const r = parseCustomWidget(`
type: image-carousel
autoplay: false
duration: 0
items:
  - fileId: a
`)
    expect(r).toEqual({ ok: true, spec: { type: 'image-carousel', items: [{ fileId: 'a' }] } })
  })

  test('reports an unknown widget type without throwing', () => {
    const r = parseCustomWidget('type: video-player\nitems: []')
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('expected failure')
    expect(r.error).toContain('video-player')
  })

  test('reports image-compare with the wrong number of items', () => {
    const r = parseCustomWidget('type: image-compare\nitems:\n  - fileId: a')
    expect(r.ok).toBe(false)
  })

  test('reports invalid YAML without throwing', () => {
    const r = parseCustomWidget('type: image-carousel\n  items: [unbalanced')
    expect(r.ok).toBe(false)
    if (r.ok) throw new Error('expected failure')
    expect(r.error).toContain('Unable to display')
  })
})
