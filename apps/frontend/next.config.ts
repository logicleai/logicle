import { NextConfig } from 'next'

// Fully static build (no server-rendering runtime) — see server.ts's
// serveStaticFrontend for the hand-rolled replacement of what Next used to
// do at request time (env/brand injection, the proxy.ts auth redirect, and
// the redirects/rewrites/headers below, none of which apply automatically
// once Next is build-time only). These next.config.ts entries are kept
// because `next dev` (used for local development) still applies them.
const redirects = [
  {
    source: '/',
    destination: '/chat',
    permanent: true,
  },
]

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    // No `/_next/image` optimizer route exists without a server runtime.
    unoptimized: true,
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'logicle.ai',
        pathname: '**',
      },
    ],
  },
  output: 'export',
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
    ]
  },
  async redirects() {
    return redirects
  },
  rewrites: async () => {
    return [
      {
        source: '/.well-known/saml.cer',
        destination: '/api/well-known/saml.cer',
      },
      {
        source: '/.well-known/saml-configuration',
        destination: '/well-known/saml-configuration',
      },
    ]
  },
  transpilePackages: ['rimraf', '@logicle/file-analyzer'],
}

module.exports = nextConfig
