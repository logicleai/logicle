import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { CustomWidget } from '@/frontend/app/chat/components/widgets/CustomWidget'
import type { WidgetSpec } from '@/lib/widgets/customWidget'

const render = (spec: WidgetSpec) =>
  renderToStaticMarkup(React.createElement(CustomWidget, { spec }))

describe('CustomWidget rendering', () => {
  test('image-compare renders both images (by fileId url) and starts on the first', () => {
    const html = render({
      type: 'image-compare',
      items: [
        { fileId: 'aaa', label: 'Edited', alt: 'after' },
        { fileId: 'bbb', label: 'Original' },
      ],
    })
    expect(html).toContain('src="/api/files/aaa/content"')
    expect(html).toContain('src="/api/files/bbb/content"')
    expect(html).toContain('alt="after"')
    // second image falls back to its label for alt text
    expect(html).toContain('alt="Original"')
    // first item visible, second hidden initially
    expect(html).toMatch(/src="\/api\/files\/bbb\/content"[^>]*class="[^"]*hidden/)
    expect(html).not.toMatch(/src="\/api\/files\/aaa\/content"[^>]*class="[^"]*hidden/)
  })

  test('image-compare url-encodes the file id', () => {
    const html = render({
      type: 'image-compare',
      items: [{ fileId: 'a/b c' }, { fileId: 'd' }],
    })
    expect(html).toContain('src="/api/files/a%2Fb%20c/content"')
  })

  test('image-carousel renders one figure per item, in order', () => {
    const html = render({
      type: 'image-carousel',
      items: [{ fileId: '1', label: 'Front' }, { fileId: '2', label: 'Side' }, { fileId: '3' }],
    })
    expect(html.match(/<figure/g)).toHaveLength(3)
    expect(html.indexOf('/api/files/1/content')).toBeLessThan(html.indexOf('/api/files/2/content'))
    expect(html).toContain('Front')
    expect(html).toContain('Side')
  })

  test('unknown widget type degrades to a fallback instead of throwing', () => {
    const html = render({ type: 'totally-unknown' } as unknown as WidgetSpec)
    expect(html).toContain('rounded border border-dashed')
  })
})
