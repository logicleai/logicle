import { docsRoute } from 'next-rest-framework'

// export const runtime = 'edge'; // Edge runtime is supported.

export const { GET } = docsRoute({
  allowedPaths: ['/api/v1/.*'],
  openApiObject: {
    info: {
      title: 'Logicle Apis',
      version: '0.0.1',
      description: 'Logicle Apis',
    },
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
      },
    },
  },
  openApiJsonPath: '/openapi.json',
  docsConfig: {
    provider: 'swagger-ui',
    title: 'Logicle Apis',
    description: 'Logicle Apis',
  },
})
