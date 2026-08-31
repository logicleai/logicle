import { beforeEach, describe, expect, it, vi } from 'vitest'

const getEnvironmentPayload = vi.fn()
const getProvisionedBrandAssets = vi.fn()

vi.mock('@/lib/app-config', () => ({
  getEnvironmentPayload: () => getEnvironmentPayload(),
  getProvisionedBrandAssets: () => getProvisionedBrandAssets(),
}))

import { injectBootstrapData } from '@/lib/staticFrontendVite'

const SHELL = [
  '<!doctype html>',
  '<html><head>',
  '<link rel="icon" href="/favicon.ico" />',
  '<link rel="stylesheet" href="/assets/index-abc.css">',
  '<title>Logicle</title>',
  '</head><body>',
  '<div id="root"></div>',
  '</body></html>',
].join('\n')

beforeEach(() => {
  getEnvironmentPayload.mockResolvedValue({ appDisplayName: 'Logicle' })
  getProvisionedBrandAssets.mockResolvedValue({ styles: [], i18n: {} })
})

describe('injectBootstrapData', () => {
  it('rewrites the title and favicon from the environment payload', async () => {
    getEnvironmentPayload.mockResolvedValue({ appDisplayName: 'Acme', faviconPath: '/brand/logo.png' })

    const out = await injectBootstrapData(SHELL)

    expect(out).toContain('<title>Acme</title>')
    expect(out).toContain('<link rel="icon" href="/brand/logo.png" />')
    expect(out).not.toContain('/favicon.ico')
  })

  it('falls back to /favicon.ico when no faviconPath is provisioned', async () => {
    const out = await injectBootstrapData(SHELL)
    expect(out).toContain('<link rel="icon" href="/favicon.ico" />')
  })

  it('HTML-escapes the display name in the title', async () => {
    getEnvironmentPayload.mockResolvedValue({ appDisplayName: 'A & B <script>' })
    const out = await injectBootstrapData(SHELL)
    expect(out).toContain('<title>A &amp; B &lt;script&gt;</title>')
  })

  it('injects the brand stylesheet at the very end of <body>, after the app CSS', async () => {
    getProvisionedBrandAssets.mockResolvedValue({
      styles: [{ name: 'theme.css', content: ':root{--primary:#ff0000}' }],
      i18n: {},
    })

    const out = await injectBootstrapData(SHELL)

    expect(out).toContain('<style id="__logicle_brand_css__">:root{--primary:#ff0000}</style></body>')
    expect(out.indexOf('__logicle_brand_css__')).toBeGreaterThan(out.indexOf('/assets/index-abc.css'))
  })

  it('injects the environment and brand-i18n payloads as JSON script tags', async () => {
    getEnvironmentPayload.mockResolvedValue({ appDisplayName: 'Logicle', appUrl: 'http://x' })
    getProvisionedBrandAssets.mockResolvedValue({ styles: [], i18n: { cancel: 'Nope' } })

    const out = await injectBootstrapData(SHELL)

    expect(out).toContain(
      '<script id="__logicle_env__" type="application/json">{"appDisplayName":"Logicle","appUrl":"http://x"}</script>'
    )
    expect(out).toContain(
      '<script id="__logicle_brand_i18n__" type="application/json">{"cancel":"Nope"}</script>'
    )
  })

  it('neutralizes a </style> sequence smuggled into brand CSS', async () => {
    getProvisionedBrandAssets.mockResolvedValue({
      styles: [{ name: 'x.css', content: 'a{}</style><script>alert(1)</script>' }],
      i18n: {},
    })

    const out = await injectBootstrapData(SHELL)

    expect(out).not.toContain('</style><script>alert(1)')
    expect(out).toContain('<\\/style>')
  })

  it('escapes < in the embedded environment JSON so it cannot break out of the script tag', async () => {
    getEnvironmentPayload.mockResolvedValue({ appDisplayName: '</script><script>x' })

    const out = await injectBootstrapData(SHELL)

    expect(out).not.toContain('</script><script>x')
    expect(out).toContain('\\u003c/script>')
  })
})
