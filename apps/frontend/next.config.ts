import { NextConfig } from 'next'

// `next build` always forces NODE_ENV=production regardless of the invoking
// script's env, so this reliably distinguishes a real production build from
// `next dev` (used by both apps/frontend/dev.ts and server.ts's dev-mode
// nextApp).
const isProductionBuild = process.env.NODE_ENV === 'production'

// Fully static build (no server-rendering runtime) — see server.ts's
// serveStaticFrontend for the hand-rolled replacement of what Next used to
// do at request time (env/brand injection, the proxy.ts auth redirect, and
// the redirects/rewrites/headers below, none of which apply automatically
// once Next is build-time only). `output: 'export'` also hard-disables
// middleware (proxy.ts's auth redirect) even under `next dev`, so it's only
// set for the real production build — dev keeps Next's normal server
// behavior (middleware, redirects/rewrites/headers all work as before).
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
  output: isProductionBuild ? 'export' : undefined,
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
