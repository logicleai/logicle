import { docsRoute } from 'next-rest-framework'

// export const runtime = 'edge'; // Edge runtime is supported.

export const { GET } = docsRoute({
  allowedPaths: ['/api/v1/.*'],
  openApiObject: {
    info: {
      title: 'My API',
      version: '1.0.0',
      description: 'My API description.',
    },
  },
  openApiJsonPath: '/openapi.json',
  docsConfig: {
    provider: 'redoc', // redoc | swagger-ui
    title: 'My API',
    description: 'My API description.',
    // ...
  },
})
