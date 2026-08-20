import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, test } from 'vitest'
import { Markdown } from '@/frontend/app/chat/components/Markdown'

const renderMarkdown = (markdown: string) =>
  renderToStaticMarkup(React.createElement(Markdown, { className: '', children: markdown }))

describe('Markdown HTML sanitization', () => {
  test('renders safe inline formatting, external links, and images', () => {
    const html = renderMarkdown(`
<mark>highlight</mark> <u>underline</u>

<a href="https://example.com/docs">docs</a>

<img src="https://example.com/image.png" alt="example">
`)

    expect(html).toContain('<mark>highlight</mark>')
    expect(html).toContain('<u>underline</u>')
    expect(html).toContain('<a href="https://example.com/docs"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).not.toContain('node="')
    expect(html).toContain('<img src="https://example.com/image.png" alt="example"/>')
  })

  test('allows only presentation-safe inline text styles', () => {
    const html = renderMarkdown(
      '<span style="color: red">styled</span>\n\n' +
        '<span style="position: fixed; inset: 0">unsafe</span>'
    )

    expect(html).toContain('<span style="color:red">styled</span>')
    expect(html).toContain('<span>unsafe</span>')
    expect(html).not.toContain('position')
  })

  test('removes executable markup and unsafe URLs', () => {
    const html = renderMarkdown(`
<script>alert('xss')</script>
<iframe src="https://example.com"></iframe>
<img src="x" onerror="alert('xss')">
<a href="javascript:alert('xss')">bad link</a>
`)

    expect(html).not.toContain('<script')
    expect(html).not.toContain('<iframe')
    expect(html).not.toContain('onerror')
    expect(html).not.toContain('javascript:')
  })
})
