/* eslint @typescript-eslint/no-var-requires: "off" */
const { i18n } = require('./next-i18next.config')

const redirects = []
redirects.push({
  source: '/',
  destination: '/chat',
  permanent: true,
})

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'logicle.ai',
        pathname: '**',
      },
    ],
  },
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  i18n,
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
  webpack(config) {
    config.experiments = { asyncWebAssembly: true, layers: true }
    config.resolve.fallback = {
      ...config.resolve.fallback, // if you miss it, all the other options in fallback, specified
      // by next.js will be dropped. Doesn't make much sense, but how it is
    }
    return config
  },
  swcMinify: true,
  experimental: {
    serverComponentsExternalPackages: ['typeorm'],
    instrumentationHook: true,
    serverActions: {
      allowedForwardedHosts: ['accounts.google.com', 'https://accounts.google.com'],
      allowedOrigins: ['https://accounts.google.com', 'accounts.google.com'],
    },
  },
}

module.exports = nextConfig
