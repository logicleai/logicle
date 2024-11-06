/* eslint @typescript-eslint/no-var-requires: "off" */
const { i18n } = require('./next-i18next.config')
import { NextConfig } from 'next'

const redirects = [
{
  source: '/',
  destination: '/chat',
  permanent: true,
}
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
  experimental: {
    turbo: {
    },
    serverActions: {
      allowedOrigins: ['https://accounts.google.com', 'accounts.google.com'],
    },
  },
}

module.exports = nextConfig
