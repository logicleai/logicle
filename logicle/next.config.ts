/* eslint @typescript-eslint/no-var-requires: "off" */
import { NextConfig } from 'next'

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
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'logicle.ai',
        pathname: '**',
      },
    ],
  },
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
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
  serverExternalPackages: ['openid-client', 'jose', 'openpgp'],
  experimental: {
    serverActions: {
      allowedOrigins: ['https://accounts.google.com', 'accounts.google.com'],
    },
  },
}

module.exports = nextConfig
