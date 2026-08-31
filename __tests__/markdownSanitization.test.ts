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

<sub>subscript</sub> <sup>superscript</sup> <del>deleted</del> <ins>inserted</ins>

<a href="https://example.com/docs">docs</a>

<img src="https://example.com/image.png" alt="example">
`)

    expect(html).toContain('<mark>highlight</mark>')
    expect(html).toContain('<u>underline</u>')
    expect(html).toContain('<sub>subscript</sub>')
    expect(html).toContain('<sup>superscript</sup>')
    expect(html).toContain('<del>deleted</del>')
    expect(html).toContain('<ins>inserted</ins>')
    expect(html).toContain('<a href="https://example.com/docs"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
    expect(html).not.toContain('node="')
    expect(html).toContain('<img src="https://example.com/image.png" alt="example"/>')
  })

  test('allows presentation styles but strips overlay/clickjacking properties', () => {
    const html = renderMarkdown(
      '<span style="color:green;font-weight:bold">styled</span>\n\n' +
        '<span style="color: red; position: fixed; inset: 0; z-index: 99">partially safe</span>\n\n' +
        '<p style="font-size:20px;text-align:center;font-family:Georgia,serif">rich</p>\n\n' +
        '<span style="transform:translateY(-200px)">shifted</span>\n\n' +
        '<div style="background:red;border-radius:16px;padding:14px 20px;color:white">box</div>'
    )

    expect(html).toContain('<span style="color:green;font-weight:bold">styled</span>')
    expect(html).toContain('<span style="color:red">partially safe</span>')
    expect(html).not.toContain('position')
    expect(html).not.toContain('inset')
    expect(html).not.toContain('z-index')
    expect(html).not.toContain('transform')
    expect(html).toContain('font-size:20px')
    expect(html).toContain('text-align:center')
    expect(html).toContain('border-radius:16px')
  })

  test('strips style values that can fetch or execute', () => {
    const html = renderMarkdown(
      '<div style="background-image:url(https://evil.example/track.png)">tracked</div>\n\n' +
        '<span style="color:red;background:url(javascript:alert(1))">x</span>\n\n' +
        '<p style="width:@import url(x)">y</p>'
    )

    expect(html).not.toContain('evil.example')
    expect(html).not.toContain('url(')
    expect(html).not.toContain('@import')
    expect(html).toContain('<span style="color:red">x</span>')
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
